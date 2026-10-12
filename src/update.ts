// Hard refresh for the installed PWA: drop the service worker and its caches so the
// reload fetches the latest deploy from the network instead of the precached copy.
export async function forceUpdate() {
  if (navigator.onLine) {
    try {
      const regs = (await navigator.serviceWorker?.getRegistrations()) ?? [];
      await Promise.all(regs.map((r) => r.unregister()));
      if ('caches' in window) {
        const keys = await caches.keys();
        await Promise.all(keys.map((k) => caches.delete(k)));
      }
    } catch {
      // fall through to a plain reload
    }
  }
  location.reload();
}
