type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

/**
 * Fullscreen + landscape lock, requested from a user gesture. The manifest opens the app
 * as a plain standalone window (some Android skins, e.g. Xiaomi's, refuse to launch a PWA
 * that asks for fullscreen/landscape up front), so we upgrade here instead. Every failure
 * is swallowed: the game still runs windowed, with the "turn your phone" overlay as fallback.
 */
type WebkitDoc = Document & { webkitFullscreenElement?: Element | null; webkitExitFullscreen?: () => void; webkitFullscreenEnabled?: boolean };
type WebkitEl = HTMLElement & { webkitRequestFullscreen?: () => void };
const wd = document as WebkitDoc;
const OPT_OUT = 'bb.noFullscreen';

export const isFullscreen = () => !!(document.fullscreenElement || wd.webkitFullscreenElement);

/** False on iPhone Safari (no element fullscreen) and when already installed full-window. */
export function fullscreenSupported(): boolean {
  const de = document.documentElement as WebkitEl;
  if (!de.requestFullscreen && !de.webkitRequestFullscreen) return false;
  if (document.fullscreenEnabled === false && !wd.webkitFullscreenEnabled) return false;
  return !matchMedia('(display-mode: fullscreen)').matches;
}

/** The player turned fullscreen off with the button: stop forcing it back on taps. */
function optedOut(): boolean {
  try { return localStorage.getItem(OPT_OUT) === '1'; } catch { return false; }
}
function setOptOut(v: boolean) {
  try { if (v) localStorage.setItem(OPT_OUT, '1'); else localStorage.removeItem(OPT_OUT); } catch { /* private mode */ }
}

function requestFs(): Promise<void> | undefined {
  const de = document.documentElement as WebkitEl;
  if (de.requestFullscreen) return de.requestFullscreen({ navigationUI: 'hide' });
  if (de.webkitRequestFullscreen) { de.webkitRequestFullscreen(); return Promise.resolve(); }
  return undefined;
}

const lock = () => (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape').catch(() => {});

export function enterLandscape(): Promise<void> {
  if (!matchMedia('(pointer: coarse)').matches || optedOut()) return Promise.resolve();
  if (isFullscreen()) return Promise.resolve(lock());
  try {
    const req = requestFs();
    if (!req) return Promise.resolve(lock());
    return req.then(lock, lock);
  } catch {
    return Promise.resolve();
  }
}

/** Fullscreen button: works on any device, and remembers when the player turns it off. */
export function toggleFullscreen(): Promise<void> {
  try {
    if (isFullscreen()) {
      setOptOut(true);
      if (document.exitFullscreen) return document.exitFullscreen().catch(() => {});
      wd.webkitExitFullscreen?.();
      return Promise.resolve();
    }
    setOptOut(false);
    const req = requestFs();
    if (!req) return Promise.resolve();
    return req.then(() => (matchMedia('(pointer: coarse)').matches ? lock() : undefined), () => {});
  } catch {
    return Promise.resolve();
  }
}

export function onFullscreenChange(cb: () => void) {
  document.addEventListener('fullscreenchange', cb);
  document.addEventListener('webkitfullscreenchange', cb);
}

/** Go fullscreen + landscape on the first tap, retrying on later taps until it sticks. */
export function enterLandscapeOnFirstGesture() {
  // pointerdown doesn't grant user activation for touch in Chrome; pointerup / click do
  const events = ['pointerup', 'click', 'keydown'] as const;
  const off = () => events.forEach((e) => window.removeEventListener(e, onGesture, true));
  const onGesture = () => {
    if (isFullscreen() || optedOut()) return off();
    void enterLandscape().then(() => {
      if (isFullscreen() || !fullscreenSupported()) off();
    });
  };
  events.forEach((e) => window.addEventListener(e, onGesture, true));
}
