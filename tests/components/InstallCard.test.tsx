import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

import { InstallCard } from '../../src/components/InstallCard';
import type { InstallPromptEvent } from '../../src/pwa/installPrompt';
import { createInstallPromptStore } from '../../src/pwa/installPrompt';
import { buttonByText, click, render } from '../render';

function storeWithTarget(standalone = false) {
  const target = new EventTarget();
  const store = createInstallPromptStore(() => standalone);
  store.listen(target as unknown as Window);
  return { store, target };
}

function offerPrompt(target: EventTarget) {
  const event = new Event('beforeinstallprompt') as InstallPromptEvent;
  event.prompt = vi.fn(() => Promise.resolve());
  event.userChoice = Promise.resolve({ outcome: 'accepted' });
  act(() => {
    target.dispatchEvent(event);
  });
  return event;
}

describe('InstallCard', () => {
  test('explains the browser menu when there is no install prompt', () => {
    const { store } = storeWithTarget();
    const html = renderToStaticMarkup(<InstallCard store={store} />);

    expect(html).toContain('Install Paydown');
    expect(html).toContain('Add to Home screen');
    expect(html).toContain('tap Share in Safari');
    expect(html).not.toContain('Install app</button>');
  });

  test('renders nothing inside the installed app', () => {
    const { store } = storeWithTarget(true);

    expect(renderToStaticMarkup(<InstallCard store={store} />)).toBe('');
  });

  test('opens the browser prompt from the button, then hides the button', async () => {
    const { store, target } = storeWithTarget();
    const view = render(<InstallCard store={store} />);
    const event = offerPrompt(target);

    const button = buttonByText(view.container, 'Install app');
    expect(button).toBeDefined();
    expect(view.container.textContent).not.toContain('tap Share in Safari');

    click(button);
    await act(async () => {
      await event.userChoice;
    });

    expect(event.prompt).toHaveBeenCalledTimes(1);
    expect(buttonByText(view.container, 'Install app')).toBeUndefined();
    view.cleanup();
  });

  test('confirms an install made from this tab', () => {
    const { store, target } = storeWithTarget();
    const view = render(<InstallCard store={store} />);
    offerPrompt(target);
    act(() => {
      target.dispatchEvent(new Event('appinstalled'));
    });

    expect(view.container.textContent).toContain('Paydown is installed');
    expect(buttonByText(view.container, 'Install app')).toBeUndefined();
    view.cleanup();
  });
});
