// eventemitter3's API, enough for PeerJS
export class EventEmitter {
  constructor() { this._ev = new Map(); }
  on(n, fn, ctx) { (this._ev.get(n) ?? this._ev.set(n, []).get(n)).push({ fn, ctx, once: false }); return this; }
  addListener(n, fn, ctx) { return this.on(n, fn, ctx); }
  once(n, fn, ctx) { (this._ev.get(n) ?? this._ev.set(n, []).get(n)).push({ fn, ctx, once: true }); return this; }
  off(n, fn) { if (!fn) this._ev.delete(n); else this._ev.set(n, (this._ev.get(n) ?? []).filter((l) => l.fn !== fn)); return this; }
  removeListener(n, fn) { return this.off(n, fn); }
  removeAllListeners(n) { if (n === undefined) this._ev.clear(); else this._ev.delete(n); return this; }
  listeners(n) { return (this._ev.get(n) ?? []).map((l) => l.fn); }
  listenerCount(n) { return (this._ev.get(n) ?? []).length; }
  emit(n, ...a) { const ls = this._ev.get(n); if (!ls || !ls.length) return false; for (const l of [...ls]) { if (l.once) this.off(n, l.fn); l.fn.apply(l.ctx ?? this, a); } return true; }
}
export default EventEmitter;
