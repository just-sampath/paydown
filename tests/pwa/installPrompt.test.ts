import { describe, expect, test, vi } from 'vitest';

import type { InstallPromptEvent } from '../../src/pwa/installPrompt';
import { createInstallPromptStore } from '../../src/pwa/installPrompt';

function promptEvent(outcome: 'accepted' | 'dismissed' = 'accepted') {
  const event = new Event('beforeinstallprompt') as InstallPromptEvent;
  event.prompt = vi.fn(() => Promise.resolve());
  event.userChoice = Promise.resolve({ outcome });
  return event;
}

describe('createInstallPromptStore', () => {
  test('is unavailable until the browser offers its prompt', () => {
    const target = new EventTarget();
    const store = createInstallPromptStore(() => false);
    store.listen(target as unknown as Window);
    const listener = vi.fn();
    store.subscribe(listener);

    expect(store.getState()).toBe('unavailable');
    target.dispatchEvent(promptEvent());

    expect(store.getState()).toBe('available');
    expect(listener).toHaveBeenCalledTimes(1);
  });

  test('shows the prompt once, then waits for a new one', async () => {
    const target = new EventTarget();
    const store = createInstallPromptStore(() => false);
    store.listen(target as unknown as Window);
    const event = promptEvent('dismissed');
    target.dispatchEvent(event);

    await store.install();
    await store.install();

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(store.getState()).toBe('unavailable');
  });

  test('reports an install made from this tab', () => {
    const target = new EventTarget();
    const store = createInstallPromptStore(() => false);
    store.listen(target as unknown as Window);
    target.dispatchEvent(promptEvent());
    target.dispatchEvent(new Event('appinstalled'));

    expect(store.getState()).toBe('installed');
  });

  test('offers nothing inside the installed app', () => {
    const target = new EventTarget();
    const store = createInstallPromptStore(() => true);
    store.listen(target as unknown as Window);
    target.dispatchEvent(promptEvent());

    expect(store.getState()).toBe('standalone');
  });
});
