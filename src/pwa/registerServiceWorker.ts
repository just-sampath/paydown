type RegisterOptions = {
  container?: Pick<ServiceWorkerContainer, 'register'>;
  url?: string;
  target?: Pick<Window, 'addEventListener'>;
};

/**
 * Registers the offline service worker once the page has loaded, so it never competes
 * with the first render. Browsers without service workers just skip it.
 *
 * @param options - Overrides for tests.
 * @param options.container - Service worker container, `navigator.serviceWorker` by default.
 * @param options.url - Worker URL under the site's base path.
 * @param options.target - Object that fires `load`, `window` by default.
 * @returns Nothing.
 */
export function registerServiceWorker({
  container = typeof navigator === 'undefined' ? undefined : navigator.serviceWorker,
  url = `${import.meta.env.BASE_URL}sw.js`,
  target = window,
}: RegisterOptions = {}): void {
  if (!container) {
    return;
  }

  target.addEventListener('load', () => {
    // The app works the same without offline support, so a failed registration is ignored.
    container.register(url).catch(() => undefined);
  });
}
