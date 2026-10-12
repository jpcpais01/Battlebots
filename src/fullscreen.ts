type LockableOrientation = ScreenOrientation & { lock?: (o: string) => Promise<void> };

/**
 * Fullscreen + landscape lock, requested from a user gesture. The manifest opens the app
 * as a plain standalone window (some Android skins, e.g. Xiaomi's, refuse to launch a PWA
 * that asks for fullscreen/landscape up front), so we upgrade here instead. Every failure
 * is swallowed: the game still runs windowed, with the "turn your phone" overlay as fallback.
 */
export function enterLandscape(): Promise<void> {
  if (!matchMedia('(pointer: coarse)').matches) return Promise.resolve();
  const lock = () => (screen.orientation as LockableOrientation | undefined)?.lock?.('landscape').catch(() => {});
  if (document.fullscreenElement) return Promise.resolve(lock());
  const de = document.documentElement;
  try {
    const req = de.requestFullscreen?.({ navigationUI: 'hide' });
    if (!req) return Promise.resolve(lock());
    return req.then(lock, lock);
  } catch {
    return Promise.resolve();
  }
}

/** Go fullscreen + landscape on the first tap, retrying on later taps until it sticks. */
export function enterLandscapeOnFirstGesture() {
  // pointerdown doesn't grant user activation for touch in Chrome; pointerup / click do
  const events = ['pointerup', 'click', 'keydown'] as const;
  const off = () => events.forEach((e) => window.removeEventListener(e, onGesture, true));
  const onGesture = () => {
    if (document.fullscreenElement) return off();
    void enterLandscape().then(() => {
      if (document.fullscreenElement || !document.documentElement.requestFullscreen) off();
    });
  };
  events.forEach((e) => window.addEventListener(e, onGesture, true));
}
