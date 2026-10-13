import type { BotSpec } from '../game/loadout';
import { sanitizeBot, sanitizeRecord, type Record_ } from '../ui/store';
import { FirebaseError, firebaseReady, getDoc, refresh, setDoc, signIn, signUp, type Tokens } from './firebase';

/**
 * A player account: a username and password, with the bot (parts, paint, emotes) and the
 * win record saved to the cloud so they follow the player to any device.
 *
 * Firebase Auth only knows email logins, so a username maps to a made-up address that
 * never receives mail. Auth keeps those unique, which makes usernames unique too.
 * The game still saves everything locally first and plays fine logged out or offline:
 * the cloud copy catches up whenever it can.
 */

const EMAIL_DOMAIN = 'players.battlebots.app';
const SESSION_KEY = 'bb.account';
/** Set while local changes haven't reached the cloud yet. */
const DIRTY_KEY = 'bb.cloudDirty';
const PUSH_DELAY = 1500;

export const USERNAME_MIN = 3;
export const USERNAME_MAX = 16;
export const PASSWORD_MIN = 6;

/** Why a username can't be used, or null when it's fine. */
export function usernameProblem(name: string): string | null {
  if (name.length < USERNAME_MIN) return `Usernames need at least ${USERNAME_MIN} characters.`;
  if (name.length > USERNAME_MAX) return `Usernames are at most ${USERNAME_MAX} characters.`;
  if (!/^[A-Za-z0-9_]+$/.test(name)) return 'Use only letters, numbers and _ in your username.';
  return null;
}

const emailOf = (name: string) => `${name.toLowerCase()}@${EMAIL_DOMAIN}`;

/** Firebase error codes in words a player understands. */
function explain(e: unknown): string {
  const code = e instanceof FirebaseError ? e.code : '';
  switch (code) {
    case 'EMAIL_EXISTS':
      return 'That username is taken.';
    case 'EMAIL_NOT_FOUND':
    case 'INVALID_PASSWORD':
    case 'INVALID_LOGIN_CREDENTIALS':
    case 'INVALID_EMAIL':
      return 'Wrong username or password.';
    case 'WEAK_PASSWORD':
      return `Passwords need at least ${PASSWORD_MIN} characters.`;
    case 'TOO_MANY_ATTEMPTS_TRY_LATER':
      return 'Too many tries. Wait a minute and try again.';
    case 'USER_DISABLED':
      return 'This account has been switched off.';
    case 'OPERATION_NOT_ALLOWED':
    case 'CONFIGURATION_NOT_FOUND':
      return 'Accounts aren\'t switched on yet.';
    case 'NETWORK':
      return 'Can\'t reach the server. Check your connection.';
    default:
      return 'Something went wrong. Try again.';
  }
}

/** Refresh-token errors that mean the session is over (as opposed to being offline). */
const SESSION_DEAD = new Set(['TOKEN_EXPIRED', 'INVALID_REFRESH_TOKEN', 'USER_NOT_FOUND', 'USER_DISABLED', 'INVALID_GRANT_TYPE']);

interface Session extends Tokens {
  username: string;
}

export type SyncState = 'idle' | 'syncing' | 'saved' | 'offline';

export interface AccountHooks {
  /** The bot and record the game holds right now. */
  local: () => { bot: BotSpec; record: Record_ };
  /** The cloud copy replaced the local one (logging in, or newer changes from another device). */
  load: (bot: BotSpec, record: Record_) => void;
  /** Signed in or out, or the sync state changed. */
  changed: () => void;
}

export class Account {
  private session: Session | null = null;
  sync: SyncState = 'idle';
  /** When the cloud copy last matched this device (ms since epoch, 0: not this session). */
  syncedAt = 0;
  private timer = 0;
  private pushing: Promise<void> | null = null;
  /** Writing cloud data into the local save: those saves mustn't echo back up. */
  private loading = false;
  /**
   * This device has matched the cloud since signing in. Until then local edits never go up:
   * a phone that logs in while offline mustn't overwrite the account's bot with its own.
   */
  private synced = false;

  constructor(private hooks: AccountHooks) {
    this.session = readSession();
    window.addEventListener('online', () => void (this.synced && this.dirty && this.push()));
    // phones kill backgrounded tabs without warning: send pending changes as the page hides
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.timer && this.synced) void this.push(true);
    });
  }

  /** Accounts are available (the Firebase config is set). */
  get available() {
    return firebaseReady();
  }

  get username() {
    return this.session?.username ?? null;
  }

  private get dirty() {
    try {
      return localStorage.getItem(DIRTY_KEY) === '1';
    } catch {
      return false;
    }
  }

  private set dirty(v: boolean) {
    try {
      if (v) localStorage.setItem(DIRTY_KEY, '1');
      else localStorage.removeItem(DIRTY_KEY);
    } catch {
      /* ignore */
    }
  }

  /** On launch: bring a saved login up to date with the cloud. */
  start() {
    if (!this.session || !this.available) return;
    // changes made offline last time go up; otherwise another device may have newer ones
    if (this.dirty) {
      this.synced = true;
      void this.push();
    } else void this.pull();
  }

  async register(username: string, password: string): Promise<string | null> {
    const bad = usernameProblem(username);
    if (bad) return bad;
    if (password.length < PASSWORD_MIN) return `Passwords need at least ${PASSWORD_MIN} characters.`;
    try {
      const t = await signUp(emailOf(username), password);
      this.begin({ ...t, username });
      // a new account starts with the bot this device already has
      this.synced = true;
      await this.push();
      return null;
    } catch (e) {
      return explain(e);
    }
  }

  async login(username: string, password: string): Promise<string | null> {
    const name = username.trim();
    if (!name || !password) return 'Enter your username and password.';
    try {
      const t = await signIn(emailOf(name), password);
      this.begin({ ...t, username: name });
      // the account's bot comes down in the background; a failed load retries on the next edit
      void this.pull();
      return null;
    } catch (e) {
      return explain(e);
    }
  }

  /** Sign out. The bot stays on this device as it is. */
  logout() {
    clearTimeout(this.timer);
    this.timer = 0;
    if (this.session && this.synced && this.dirty) void this.push(true);
    this.session = null;
    this.synced = false;
    this.sync = 'idle';
    this.syncedAt = 0;
    writeSession(null);
    this.dirty = false;
    this.hooks.changed();
  }

  /** The local save changed: send it up shortly (several quick edits make one write). */
  saved() {
    if (!this.session || this.loading) return;
    clearTimeout(this.timer);
    if (!this.synced) {
      // not matched up yet: fetch the account's copy first (it wins over this edit)
      this.timer = window.setTimeout(() => this.pull(), PUSH_DELAY);
      return;
    }
    this.dirty = true;
    this.timer = window.setTimeout(() => this.push(), PUSH_DELAY);
  }

  private begin(s: Session) {
    this.session = s;
    writeSession(s);
    this.dirty = false;
    this.hooks.changed();
  }

  private setSync(s: SyncState) {
    if (s === 'saved') this.syncedAt = Date.now();
    this.sync = s;
    this.hooks.changed();
  }

  /** `s` is still the signed-in account (its tokens may have been renewed since). */
  private is(s: Session) {
    return this.session?.uid === s.uid;
  }

  /** A working id token for session `s`, renewed when it's about to run out. */
  private async token(s: Session): Promise<Tokens> {
    if (this.is(s)) s = this.session!;
    if (s.expires - Date.now() > 60_000) return s;
    try {
      const t = await refresh(s.refreshToken);
      if (this.is(s)) {
        this.session = { ...this.session!, ...t };
        writeSession(this.session);
      }
      return t;
    } catch (e) {
      if (e instanceof FirebaseError && SESSION_DEAD.has(e.code) && this.is(s)) this.logout();
      throw e;
    }
  }

  /** Load the cloud copy over the local one (a failure only marks the sync offline). */
  private async pull() {
    const s = this.session;
    if (!s) return;
    clearTimeout(this.timer);
    this.timer = 0;
    this.setSync('syncing');
    try {
      const t = await this.token(s);
      if (!this.is(s)) return;
      const doc = await getDoc(t, `users/${t.uid}`);
      if (!this.is(s)) return;
      if (!doc) {
        // signed up, but the first save never arrived: this device's bot becomes the account's
        this.synced = true;
        await this.push();
        return;
      }
      if (typeof doc.username === 'string' && doc.username.toLowerCase() === s.username.toLowerCase() && doc.username !== s.username) {
        // show the username as it was chosen, whatever case it was typed in at login
        this.session = { ...this.session!, username: doc.username };
        writeSession(this.session);
      }
      this.loading = true;
      try {
        this.hooks.load(sanitizeBot(doc.bot), sanitizeRecord(doc.record));
      } finally {
        this.loading = false;
      }
      this.dirty = false;
      this.synced = true;
      this.setSync('saved');
    } catch {
      if (this.session) this.setSync('offline');
    }
  }

  /** Send the local save up now. */
  private push(keepalive = false): Promise<void> {
    clearTimeout(this.timer);
    this.timer = 0;
    // one write at a time; a change during a write sends again after it
    if (this.pushing) return this.pushing.then(() => (this.dirty ? this.push(keepalive) : undefined));
    const s = this.session;
    if (!s) return Promise.resolve();
    this.dirty = true;
    const { bot, record } = this.hooks.local();
    this.setSync('syncing');
    // (a write already under way finishes even if the player signs out meanwhile)
    const run = (async () => {
      try {
        const t = await this.token(s);
        // cleared first: an edit while this write is in flight sets it again
        this.dirty = false;
        await setDoc(t, `users/${t.uid}`, { username: s.username, bot, record, updated: new Date() }, keepalive);
        if (this.is(s)) this.setSync('saved');
      } catch {
        if (this.is(s)) {
          this.dirty = true;
          this.setSync('offline');
        }
      }
    })();
    this.pushing = run.finally(() => (this.pushing = null));
    return this.pushing;
  }
}

function readSession(): Session | null {
  try {
    const s = JSON.parse(localStorage.getItem(SESSION_KEY) ?? 'null') as Partial<Session> | null;
    if (s && typeof s.uid === 'string' && typeof s.refreshToken === 'string' && typeof s.username === 'string') {
      return { uid: s.uid, username: s.username, refreshToken: s.refreshToken, idToken: s.idToken ?? '', expires: s.expires ?? 0 };
    }
  } catch {
    /* ignore */
  }
  return null;
}

function writeSession(s: Session | null) {
  try {
    if (s) localStorage.setItem(SESSION_KEY, JSON.stringify(s));
    else localStorage.removeItem(SESSION_KEY);
  } catch {
    /* ignore */
  }
}
