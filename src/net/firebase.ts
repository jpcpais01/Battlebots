/**
 * Firebase Auth and Firestore over their REST APIs.
 *
 * The game only needs four calls (sign up, sign in, refresh a token, read and write one
 * document), so this talks to the endpoints directly instead of shipping the Firebase SDK:
 * no extra download, nothing to keep in sync, and it works the same in every browser.
 *
 * The web config isn't a secret (it ships in every Firebase web app). Access is guarded by
 * the Firestore security rules in `firestore.rules`.
 */

/** Firebase web config, from the Firebase console (Project settings > Your apps > Web app). */
const CONFIG = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || 'AIzaSyBYZDi0zPpanwRe91o-clfWQWFBp2e7yp4',
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || 'battlebots-8f6f1',
};

/** Accounts work once the web config is filled in. */
export const firebaseReady = () => !!(CONFIG.apiKey && CONFIG.projectId);

const AUTH = 'https://identitytoolkit.googleapis.com/v1/accounts';
const TOKEN = 'https://securetoken.googleapis.com/v1/token';
const docsUrl = () => `https://firestore.googleapis.com/v1/projects/${CONFIG.projectId}/databases/(default)/documents`;

/** A failed call. `code` is Firebase's error code (EMAIL_EXISTS, ...) or NETWORK / HTTP_<status>. */
export class FirebaseError extends Error {
  constructor(public code: string) {
    super(code);
  }
}

async function call(url: string, init: RequestInit): Promise<Response> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new FirebaseError('NETWORK');
  }
  if (res.ok) return res;
  if (res.status === 404) throw new FirebaseError('NOT_FOUND');
  let code = `HTTP_${res.status}`;
  try {
    const body = (await res.json()) as { error?: { message?: string; status?: string } };
    // auth errors carry a code in the message ("WEAK_PASSWORD : Password should be at
    // least 6 characters"); Firestore puts prose there and the code in status
    const m = /^[A-Z_]{3,}\b/.exec(body.error?.message ?? '');
    code = m?.[0] ?? body.error?.status ?? code;
  } catch {
    /* not JSON */
  }
  throw new FirebaseError(code);
}

const json = (body: unknown): RequestInit => ({
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(body),
});

// ------------------------------------------------------------ auth

/** A signed-in user: the id token opens Firestore for an hour, the refresh token renews it. */
export interface Tokens {
  uid: string;
  idToken: string;
  refreshToken: string;
  /** ms since epoch when the id token stops working */
  expires: number;
}

interface AuthReply {
  localId: string;
  idToken: string;
  refreshToken: string;
  expiresIn: string;
}

const tokens = (r: AuthReply): Tokens => ({
  uid: r.localId,
  idToken: r.idToken,
  refreshToken: r.refreshToken,
  expires: Date.now() + Number(r.expiresIn) * 1000,
});

export async function signUp(email: string, password: string): Promise<Tokens> {
  const res = await call(`${AUTH}:signUp?key=${CONFIG.apiKey}`, json({ email, password, returnSecureToken: true }));
  return tokens((await res.json()) as AuthReply);
}

export async function signIn(email: string, password: string): Promise<Tokens> {
  const res = await call(`${AUTH}:signInWithPassword?key=${CONFIG.apiKey}`, json({ email, password, returnSecureToken: true }));
  return tokens((await res.json()) as AuthReply);
}

export async function refresh(refreshToken: string): Promise<Tokens> {
  const res = await call(`${TOKEN}?key=${CONFIG.apiKey}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: `grant_type=refresh_token&refresh_token=${encodeURIComponent(refreshToken)}`,
  });
  const r = (await res.json()) as { user_id: string; id_token: string; refresh_token: string; expires_in: string };
  return tokens({ localId: r.user_id, idToken: r.id_token, refreshToken: r.refresh_token, expiresIn: r.expires_in });
}

// ------------------------------------------------------------ firestore

type Value =
  | { nullValue: null }
  | { booleanValue: boolean }
  | { integerValue: string }
  | { doubleValue: number }
  | { stringValue: string }
  | { timestampValue: string }
  | { arrayValue: { values?: Value[] } }
  | { mapValue: { fields?: Record<string, Value> } };

/** Plain JSON to Firestore's typed values. */
function toValue(v: unknown): Value {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(toValue) } };
  return { mapValue: { fields: toFields(v as Record<string, unknown>) } };
}

function toFields(o: Record<string, unknown>): Record<string, Value> {
  const out: Record<string, Value> = {};
  for (const [k, v] of Object.entries(o)) if (v !== undefined) out[k] = toValue(v);
  return out;
}

/** Firestore's typed values back to plain JSON (timestamps become ms since epoch). */
function fromValue(v: Value): unknown {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return Date.parse(v.timestampValue);
  if ('arrayValue' in v) return (v.arrayValue.values ?? []).map(fromValue);
  return fromFields(v.mapValue.fields ?? {});
}

function fromFields(f: Record<string, Value>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(f)) out[k] = fromValue(v);
  return out;
}

const bearer = (t: Tokens) => ({ Authorization: `Bearer ${t.idToken}` });
const docPath = (path: string) => path.split('/').map(encodeURIComponent).join('/');

/** Read one document; null when it doesn't exist. */
export async function getDoc(t: Tokens, path: string): Promise<Record<string, unknown> | null> {
  try {
    const res = await call(`${docsUrl()}/${docPath(path)}`, { headers: bearer(t) });
    const doc = (await res.json()) as { fields?: Record<string, Value> };
    return fromFields(doc.fields ?? {});
  } catch (e) {
    if (e instanceof FirebaseError && e.code === 'NOT_FOUND') return null;
    throw e;
  }
}

/**
 * Create or replace one document. `keepalive` lets the write finish while the page is
 * closing (the request is a few KB, well under the browser's keepalive limit).
 */
export async function setDoc(t: Tokens, path: string, data: Record<string, unknown>, keepalive = false): Promise<void> {
  await call(`${docsUrl()}/${docPath(path)}`, {
    method: 'PATCH',
    headers: { ...bearer(t), 'Content-Type': 'application/json' },
    body: JSON.stringify({ fields: toFields(data) }),
    keepalive,
  });
}
