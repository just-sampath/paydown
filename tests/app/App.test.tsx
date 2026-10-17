import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { App } from '../../src/app/App';
import { createMemoryKeyStore, type DeviceKeyStore } from '../../src/app/deviceKeyStore';
import { LEGACY_DATA_STORAGE_KEY } from '../../src/app/storage';
import { sampleLoan } from '../../src/config/sampleLoan';
import type { LoanProfile } from '../../src/features/vault/loanProfile';
import { MIN_ITERATIONS, sealProfile, type VaultBlob } from '../../src/features/vault/vaultCrypto';

const PASSPHRASE = 'a test passphrase that is long enough';
const testProfile: LoanProfile = {
  ...sampleLoan,
  meta: { ...sampleLoan.meta, name: 'Test set', lender: 'Test Lender' },
  loan: { ...sampleLoan.loan, principal: 2_000_000, partPayments: [] },
};

let blob: VaultBlob;
let mounted: { container: HTMLDivElement; root: Root } | undefined;

beforeAll(async () => {
  blob = await sealProfile(testProfile, PASSPHRASE, { iterations: MIN_ITERATIONS });
}, 30_000);

beforeEach(() => {
  window.localStorage.clear();
  window.location.hash = '#settings';
});

afterEach(() => {
  if (mounted !== undefined) {
    const { container, root } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = undefined;
  }
});

describe('app data sets', () => {
  test('starts on the labelled sample loan and deletes legacy plaintext data', () => {
    window.localStorage.setItem(LEGACY_DATA_STORAGE_KEY, '{"partPayments":[]}');
    const { container } = mount(createMemoryKeyStore());

    expect(window.localStorage.getItem(LEGACY_DATA_STORAGE_KEY)).toBeNull();
    expect(sidebar(container)).toContain('Sample loan');
    expect(pageText(container)).toContain('Sample Bank');
    expect(buttonByText(container, 'unlock set a')).toBeTruthy();
  });

  test('a wrong passphrase shows an error and leaves the sample in place', async () => {
    const { container } = mount(createMemoryKeyStore());

    await submitPassphrase(container, 'definitely not the passphrase', false);
    await vi.waitFor(() => expect(container.textContent).toContain("didn't unlock set a"), {
      timeout: 10_000,
    });

    expect(sidebar(container)).toContain('Sample loan');
    expect(pageText(container)).not.toContain('Test Lender');
  });

  test('unlocks, remembers the device, restores on reload, and locks again', async () => {
    const keyStore = createMemoryKeyStore();
    const first = mount(keyStore);

    await submitPassphrase(first.container, PASSPHRASE, true);
    await vi.waitFor(() => expect(first.container.textContent).toContain('set a · unlocked'), {
      timeout: 10_000,
    });
    expect(sidebar(first.container)).toContain('Test set');
    expect(pageText(first.container)).toContain('Test Lender');
    expect(await keyStore.get()).toBeDefined();

    unmount();
    const second = mount(keyStore);
    await vi.waitFor(() => expect(second.container.textContent).toContain('set a · unlocked'), {
      timeout: 10_000,
    });

    await act(async () => {
      buttonByText(second.container, 'lock')?.click();
    });
    await vi.waitFor(() => expect(sidebar(second.container)).toContain('Sample loan'));
    expect(await keyStore.get()).toBeUndefined();
    expect(pageText(second.container)).not.toContain('Test Lender');
  }, 30_000);

  test('starts a newly opened page at the top', () => {
    const scrollTo = vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
    mount(createMemoryKeyStore());

    act(() => {
      window.location.hash = '#rates';
      window.dispatchEvent(new HashChangeEvent('hashchange'));
    });

    expect(scrollTo).toHaveBeenCalledWith({ top: 0 });
    scrollTo.mockRestore();
  });

  test('the unlock dialog keeps focus inside and closes on Escape from anywhere', () => {
    const { container } = mount(createMemoryKeyStore());
    const opener = buttonByText(container, 'unlock set a') as HTMLButtonElement;

    act(() => opener.focus());
    act(() => opener.click());
    const dialog = container.querySelector('form[role="dialog"]') as HTMLFormElement;
    expect(document.activeElement?.id).toBe('unlock-passphrase');

    act(() => {
      document.body.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Tab', shiftKey: true, bubbles: true }),
      );
    });
    expect(dialog.contains(document.activeElement)).toBe(true);

    act(() => {
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    });
    expect(container.querySelector('form[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });

  test('restoring the default data keeps the chosen theme', () => {
    const { container } = mount(createMemoryKeyStore());

    act(() => buttonByText(container, 'Light')?.click());
    act(() => buttonByText(container, 'Restore default data')?.click());
    const dialog = container.querySelector('[role="alertdialog"]') as HTMLElement;
    act(() => buttonByText(dialog, 'Restore default data')?.click());

    expect(document.documentElement.dataset.theme).toBe('light');
    expect(window.localStorage.getItem('paydown:prefs:v1')).toContain('"light"');
  });

  test('keeps the sample when the build has no data set', () => {
    const { container } = mount(createMemoryKeyStore(), false);

    expect((buttonByText(container, 'unlock set a') as HTMLButtonElement).disabled).toBe(true);
  });
});

function mount(keyStore: DeviceKeyStore, vaultAvailable = true) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <App
        keyStore={keyStore}
        vaultAvailable={vaultAvailable}
        vaultSource={() => Promise.resolve(JSON.parse(JSON.stringify(blob)))}
      />,
    );
  });

  mounted = { container, root };
  return mounted;
}

function unmount() {
  if (mounted !== undefined) {
    const { container, root } = mounted;
    act(() => root.unmount());
    container.remove();
    mounted = undefined;
  }
}

async function submitPassphrase(container: HTMLElement, passphrase: string, remember: boolean) {
  act(() => {
    buttonByText(container, 'unlock set a')?.click();
  });

  const input = container.querySelector('#unlock-passphrase') as HTMLInputElement;
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, passphrase);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });

  if (remember) {
    act(() => {
      (container.querySelector('input[type="checkbox"]') as HTMLInputElement).click();
    });
  }

  await act(async () => {
    (container.querySelector('form[role="dialog"]') as HTMLFormElement).requestSubmit();
  });
}

function buttonByText(container: HTMLElement, text: string) {
  return Array.from(container.querySelectorAll('button')).find(
    (button) => button.textContent?.trim() === text,
  );
}

function sidebar(container: HTMLElement): string {
  return container.querySelector('.sidebar-footer')?.textContent ?? '';
}

function pageText(container: HTMLElement): string {
  return container.querySelector('main')?.textContent ?? '';
}
