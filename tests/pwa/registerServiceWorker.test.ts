import { describe, expect, test, vi } from 'vitest';

import { registerServiceWorker } from '../../src/pwa/registerServiceWorker';

function loadTarget() {
  const target = new EventTarget();
  return {
    target: target as unknown as Pick<Window, 'addEventListener'>,
    load: () => target.dispatchEvent(new Event('load')),
  };
}

describe('registerServiceWorker', () => {
  test('registers the worker only after the page has loaded', () => {
    const register = vi.fn(() => Promise.resolve({} as ServiceWorkerRegistration));
    const { target, load } = loadTarget();

    registerServiceWorker({ container: { register }, url: '/paydown/sw.js', target });
    expect(register).not.toHaveBeenCalled();

    load();
    expect(register).toHaveBeenCalledWith('/paydown/sw.js');
  });

  test('does nothing in browsers without service workers', () => {
    const { target } = loadTarget();
    const listen = vi.spyOn(target, 'addEventListener');

    registerServiceWorker({ container: undefined, target });

    expect(listen).not.toHaveBeenCalled();
  });

  test('swallows a failed registration', async () => {
    const register = vi.fn(() => Promise.reject(new Error('blocked')));
    const { target, load } = loadTarget();

    registerServiceWorker({ container: { register }, url: '/paydown/sw.js', target });
    load();

    await expect(register.mock.results[0]?.value).rejects.toThrow('blocked');
  });
});
