import { useSyncExternalStore } from 'react';

/** Chromium's `beforeinstallprompt` event, which TypeScript's DOM types don't include. */
export type InstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
};

/**
 * - `standalone`: running as the installed app, so there is nothing to offer.
 * - `installed`: installed from this tab just now.
 * - `available`: the browser handed over its install prompt.
 * - `unavailable`: no prompt (Safari, Firefox, or not offered yet), so explain the menu.
 */
export type InstallState = 'standalone' | 'installed' | 'available' | 'unavailable';

export type InstallPromptStore = {
  listen: (target: Pick<Window, 'addEventListener'>) => void;
  subscribe: (listener: () => void) => () => void;
  getState: () => InstallState;
  install: () => Promise<void>;
};

function runningStandalone(): boolean {
  if (typeof window === 'undefined') {
    return false;
  }
  const iosStandalone = (navigator as Navigator & { standalone?: boolean }).standalone === true;
  const displayStandalone =
    typeof window.matchMedia === 'function' &&
    window.matchMedia('(display-mode: standalone)').matches;
  return iosStandalone || displayStandalone;
}

/**
 * Holds the browser's install prompt so Settings can show it later. Chromium fires
 * `beforeinstallprompt` once, often before Settings is open, so it has to be caught early.
 *
 * @param isStandalone - Whether the page runs as the installed app.
 * @returns A store that React reads through `useInstallState`.
 */
export function createInstallPromptStore(
  isStandalone: () => boolean = runningStandalone,
): InstallPromptStore {
  let deferred: InstallPromptEvent | null = null;
  let installed = false;
  const listeners = new Set<() => void>();
  const emit = (): void => listeners.forEach((listener) => listener());

  return {
    listen(target) {
      // No preventDefault, so the browser's own install hints still show.
      target.addEventListener('beforeinstallprompt', (event) => {
        deferred = event as InstallPromptEvent;
        emit();
      });
      target.addEventListener('appinstalled', () => {
        deferred = null;
        installed = true;
        emit();
      });
    },
    subscribe(listener) {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getState() {
      if (isStandalone()) {
        return 'standalone';
      }
      if (installed) {
        return 'installed';
      }
      return deferred ? 'available' : 'unavailable';
    },
    async install() {
      const event = deferred;
      if (!event) {
        return;
      }
      // A prompt can only be shown once. If it is dismissed, the browser may offer a new one.
      deferred = null;
      emit();
      await event.prompt();
      await event.userChoice;
    },
  };
}

/** The app's one store, wired to `window` from `main.tsx`. */
export const installPrompt = createInstallPromptStore();

/**
 * Reads whether Paydown can be installed right now.
 *
 * @param store - Store to read, the app's own by default.
 * @returns The current install state.
 */
export function useInstallState(store: InstallPromptStore = installPrompt): InstallState {
  // The app never renders on a server, so static rendering in tests reads the store as is.
  return useSyncExternalStore(store.subscribe, store.getState, store.getState);
}
