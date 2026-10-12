import type { DataConnection, Peer } from 'peerjs';

/**
 * Peer-to-peer link between two players, over a WebRTC data channel.
 *
 * Nothing about a fight needs a server: both phones run the same deterministic sim, so
 * all that crosses the wire is the two bots, a random seed and small sync messages. The
 * only third party is PeerJS's free public broker (0.peerjs.com), which introduces the
 * two browsers and steps out; its TURN relays carry the data when two phones on carrier
 * networks can't reach each other directly. PeerJS loads on demand, so the main bundle
 * doesn't pay for it until someone opens an online room.
 */

export interface NetMsg {
  t: string;
  [k: string]: unknown;
}

/** Peer ids on the public broker are global: prefix ours so codes never collide with other apps. */
const ID_PREFIX = 'battlebots-arena-room-';
/** No look-alikes (0/O, 1/I/L), so a code read out loud or off a screen types right. */
const CODE_CHARS = 'ABCDEFGHJKMNPQRSTUVWXYZ23456789';
export const CODE_LEN = 4;

/** What the player typed, as a room code: capitals, look-alikes and stray characters dropped. */
export const normalizeCode = (s: string) =>
  s
    .toUpperCase()
    .split('')
    .filter((c) => CODE_CHARS.includes(c))
    .join('')
    .slice(0, CODE_LEN);

function randomCode() {
  const r = new Uint32Array(CODE_LEN);
  crypto.getRandomValues(r);
  return Array.from(r, (v) => CODE_CHARS[v % CODE_CHARS.length]).join('');
}

/** PeerJS's public broker; in dev, `?peer=localhost:9000` points at a local peerjs-server instead. */
function peerOptions() {
  const local = import.meta.env.DEV ? new URLSearchParams(location.search).get('peer') : null;
  if (!local) return { debug: 0 };
  const [host, port] = local.split(':');
  return { debug: 0, host, port: Number(port) || 9000, path: '/', secure: false, config: { iceServers: [] } };
}

async function loadPeer() {
  const { Peer } = await import('peerjs');
  return Peer;
}

/** Friendly words for whatever went wrong while connecting. */
export class NetError extends Error {}

function brokerError(type: string): NetError {
  if (type === 'browser-incompatible') return new NetError("This browser can't do online fights.");
  if (type === 'peer-unavailable') return new NetError('No room with that code. Check it and try again.');
  return new NetError("Can't reach the matchmaking server. Check your connection and try again.");
}

/** Seconds of silence before the other side counts as having connection trouble. */
const LOST_AFTER = 4;
/** Seconds of silence before they count as gone for good. */
const GONE_AFTER = 25;

/**
 * One open connection to the other player: JSON messages both ways, a heartbeat that
 * measures the round trip, and notice when the other side goes quiet or leaves.
 */
export class Link {
  onMessage: (m: NetMsg) => void = () => {};
  /** The other side went quiet (bad signal, phone locked, app in the background). */
  onLost: () => void = () => {};
  /** ...and is back. */
  onBack: () => void = () => {};
  /** The connection is over, either side's doing. Fires once. */
  onClose: () => void = () => {};
  /** Smoothed round trip in ms. */
  rtt = 120;
  lost = false;
  closed = false;
  /** The other side said goodbye (as opposed to the connection dying). */
  saidBye = false;
  private heard = performance.now();
  private timer: number;
  private closers: (() => void)[] = [];

  constructor(
    private conn: DataConnection,
    /** The guest's own broker connection, torn down with the link. */
    private owned: Peer | null = null,
  ) {
    conn.on('data', (d) => this.receive(d));
    conn.on('close', () => this.close());
    conn.on('error', () => this.close());
    conn.on('iceStateChanged', (s) => {
      if (s === 'failed' || s === 'closed') this.close();
    });
    this.timer = window.setInterval(() => this.beat(), 1000);
    // a phone coming back from the background has been silent but isn't gone: ping at once
    document.addEventListener('visibilitychange', this.onVisible);
  }

  private onVisible = () => {
    if (!document.hidden) this.send({ t: 'ping', at: performance.now() });
  };

  send(m: NetMsg) {
    if (this.closed) return;
    try {
      this.conn.send(m);
    } catch {
      // the channel is going down; close() follows from the connection's own events
    }
  }

  private beat() {
    const now = performance.now();
    this.send({ t: 'ping', at: now });
    const quiet = (now - this.heard) / 1000;
    if (quiet > GONE_AFTER) this.close();
    else if (quiet > LOST_AFTER && !this.lost && !document.hidden) {
      this.lost = true;
      this.onLost();
    }
  }

  private receive(d: unknown) {
    if (this.closed || !d || typeof d !== 'object' || typeof (d as NetMsg).t !== 'string') return;
    const m = d as NetMsg;
    this.heard = performance.now();
    if (this.lost) {
      this.lost = false;
      this.onBack();
    }
    if (m.t === 'ping') this.send({ t: 'pong', at: m.at });
    else if (m.t === 'pong') {
      const rtt = performance.now() - Number(m.at);
      if (rtt >= 0 && rtt < 10000) this.rtt += (rtt - this.rtt) * 0.25;
    } else if (m.t === 'bye') {
      this.saidBye = true;
      this.close();
    }
    else this.onMessage(m);
  }

  /** Leave on purpose: tell the other side first, so they don't wait on a timeout. */
  leave() {
    this.send({ t: 'bye' });
    // give the goodbye a moment to go out before the channel closes
    setTimeout(() => this.close(), 150);
  }

  close() {
    if (this.closed) return;
    this.closed = true;
    clearInterval(this.timer);
    document.removeEventListener('visibilitychange', this.onVisible);
    try {
      this.conn.close();
    } catch {
      /* already down */
    }
    this.owned?.destroy();
    this.onClose();
    for (const fn of this.closers) fn();
  }

  /** Housekeeping when the link closes, separate from (and after) onClose. */
  whenClosed(fn: () => void) {
    this.closers.push(fn);
  }
}

/**
 * The host's side of a room: a broker registration under the room code that waits for a
 * guest. It stays open for the whole session, so if the guest drops a new one (or the
 * same one again) can join with the same code.
 */
export class Room {
  onGuest: (link: Link) => void = () => {};
  private peer: Peer | null = null;
  private busy = false;
  private closed = false;

  private constructor(readonly code: string) {}

  static async open(): Promise<Room> {
    const PeerCtor = await loadPeer();
    for (let attempt = 0; attempt < 6; attempt++) {
      const room = new Room(randomCode());
      try {
        await room.listen(PeerCtor);
        return room;
      } catch (e) {
        // that code is taken on the broker: roll another
        if (e instanceof NetError && e.message === 'taken') continue;
        throw e;
      }
    }
    throw new NetError("Couldn't get a free room code. Try again.");
  }

  private listen(PeerCtor: typeof Peer) {
    return new Promise<void>((resolve, reject) => {
      const peer = new PeerCtor(ID_PREFIX + this.code, peerOptions());
      this.peer = peer;
      let opened = false;
      peer.on('open', () => {
        opened = true;
        resolve();
      });
      peer.on('error', (err) => {
        if (opened) {
          // after opening, broker hiccups only matter while nobody has joined yet
          return;
        }
        peer.destroy();
        reject(err.type === 'unavailable-id' ? new NetError('taken') : brokerError(err.type));
      });
      // lost the broker (network blip): get back on it so the code keeps working
      peer.on('disconnected', () => {
        if (!this.closed && !peer.destroyed) setTimeout(() => !this.closed && !peer.destroyed && peer.reconnect(), 1500);
      });
      peer.on('connection', (conn) => this.accept(conn));
    });
  }

  private accept(conn: DataConnection) {
    conn.on('open', () => {
      if (this.busy || this.closed) {
        conn.send({ t: 'full' });
        setTimeout(() => conn.close(), 300);
        return;
      }
      this.busy = true;
      const link = new Link(conn);
      // once this guest is gone the room takes the next one
      link.whenClosed(() => (this.busy = false));
      this.onGuest(link);
    });
  }

  close() {
    this.closed = true;
    this.peer?.destroy();
    this.peer = null;
  }
}

/** Join the room with this code. Resolves once the two phones are connected. */
export async function joinRoom(code: string): Promise<Link> {
  const PeerCtor = await loadPeer();
  return new Promise<Link>((resolve, reject) => {
    const peer = new PeerCtor(peerOptions());
    let done = false;
    const fail = (e: NetError) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      peer.destroy();
      reject(e);
    };
    const timer = setTimeout(() => fail(new NetError("Couldn't connect to that room. Check the code and try again.")), 20000);
    peer.on('error', (err) => fail(brokerError(err.type)));
    peer.on('open', () => {
      const conn = peer.connect(ID_PREFIX + code, { reliable: true, serialization: 'json' });
      conn.on('open', () => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        // leave the broker: the data channel is all we need from here on
        peer.disconnect();
        // (a full room answers with a 'full' message, which the session handles)
        resolve(new Link(conn, peer));
      });
    });
  });
}
