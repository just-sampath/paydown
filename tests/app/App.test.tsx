import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, test, vi } from 'vitest';

import { App } from '../../src/app/App';
import { createMemoryKeyStore, type DeviceKeyStore } from '../../src/app/deviceKeyStore';
import { LEGACY_DATA_STORAGE_KEY, MY_LOAN_STORAGE_KEY } from '../../src/app/storage';
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
    expect(buttonByText(container, 'Unlock set a')).toBeTruthy();
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
    await vi.waitFor(() => expect(first.container.textContent).toContain('Set a is unlocked'), {
      timeout: 10_000,
    });
    expect(sidebar(first.container)).toContain('Test set');
    expect(pageText(first.container)).toContain('Test Lender');
    expect(await keyStore.get()).toBeDefined();

    unmount();
    const second = mount(keyStore);
    await vi.waitFor(() => expect(second.container.textContent).toContain('Set a is unlocked'), {
      timeout: 10_000,
    });

    await act(async () => {
      buttonByText(second.container, 'Lock')?.click();
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
    const opener = buttonByText(container, 'Unlock set a') as HTMLButtonElement;

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

    expect((buttonByText(container, 'Unlock set a') as HTMLButtonElement).disabled).toBe(true);
  });
});

describe('your own loan', () => {
  const MY_PASSPHRASE = 'my own loan passphrase, long enough';

  test('is created encrypted, locks on reload, and unlocks from the banner', async () => {
    const myKeyStore = createMemoryKeyStore();
    const first = mount(createMemoryKeyStore(), true, myKeyStore);

    await createLoan(first.container, MY_PASSPHRASE, false);
    expect(sidebar(first.container)).toContain('Home loan');
    expect(first.container.textContent).toContain('Your loan is open');

    const stored = window.localStorage.getItem(MY_LOAN_STORAGE_KEY) ?? '';
    expect(JSON.parse(stored)).toMatchObject({ v: 2, kdf: { name: 'PBKDF2-SHA256' } });
    expectNoPlaintext();
    expect(await myKeyStore.get()).toBeUndefined();

    unmount();
    const second = mount(createMemoryKeyStore(), true, myKeyStore);
    await vi.waitFor(() =>
      expect(second.container.textContent).toContain('Your loan is on this device and locked.'),
    );
    expect(sidebar(second.container)).toContain('Sample loan');

    act(() =>
      buttonByText(second.container.querySelector('.banner') as HTMLElement, 'Unlock')?.click(),
    );
    await submitDialog(second.container, MY_PASSPHRASE);
    await vi.waitFor(() => expect(sidebar(second.container)).toContain('Home loan'), {
      timeout: 10_000,
    });
  }, 30_000);

  test('remembers the device, saves every edit encrypted, and restores the edit', async () => {
    const myKeyStore = createMemoryKeyStore();
    const first = mount(createMemoryKeyStore(), true, myKeyStore);
    await createLoan(first.container, MY_PASSPHRASE, true);
    const before = window.localStorage.getItem(MY_LOAN_STORAGE_KEY);

    setValue(inputByLabel(first.container, 'Starting rate'), '7.25');
    await vi.waitFor(() =>
      expect(window.localStorage.getItem(MY_LOAN_STORAGE_KEY)).not.toBe(before),
    );
    expectNoPlaintext();

    unmount();
    const second = mount(createMemoryKeyStore(), true, myKeyStore);
    await vi.waitFor(() => expect(second.container.textContent).toContain('Your loan is open'), {
      timeout: 10_000,
    });
    expect(inputByLabel(second.container, 'Starting rate').value).toBe('7.25');
  }, 30_000);

  test('moves to another device by link, after confirming a replace', async () => {
    const writeText = vi.fn((_text: string) => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const first = mount(createMemoryKeyStore(), true, createMemoryKeyStore());
    await createLoan(first.container, MY_PASSPHRASE, false);
    await act(async () => buttonByText(first.container, 'Copy link')?.click());
    const link = writeText.mock.calls[0]?.[0] ?? '';
    expect(link).toContain('#open=');
    unmount();

    // Another device: nothing stored, and the link opened in the address bar.
    window.localStorage.clear();
    window.location.hash = new URL(link).hash;
    const second = mount(createMemoryKeyStore(), true, createMemoryKeyStore());
    expect(window.location.hash).toBe('#dashboard');
    expect(second.container.textContent).toContain('Open a shared loan');
    await submitDialog(second.container, MY_PASSPHRASE);
    await vi.waitFor(() => expect(sidebar(second.container)).toContain('Home loan'), {
      timeout: 10_000,
    });
    unmount();

    // A device that already has a loan asks before replacing it.
    window.location.hash = new URL(link).hash;
    const third = mount(createMemoryKeyStore(), true, createMemoryKeyStore());
    const confirm = third.container.querySelector('[role="alertdialog"]') as HTMLElement;
    expect(confirm.textContent).toContain('Replace the loan on this device?');
    act(() => buttonByText(confirm, 'Cancel')?.click());
    expect(third.container.textContent).not.toContain('Open a shared loan');

    Reflect.deleteProperty(navigator, 'clipboard');
  }, 60_000);

  test('starting from the sample takes its figures and resets the sample', async () => {
    const first = mount(createMemoryKeyStore(), true, createMemoryKeyStore());
    setValue(inputByLabel(first.container, 'Amount borrowed'), '3200000');
    expect(window.localStorage.getItem('paydown:sample:v3')).toContain('3200000');

    await createLoan(first.container, MY_PASSPHRASE, false, true);
    expect(inputByLabel(first.container, 'Amount borrowed').value).toBe('32,00,000');
    expect(window.localStorage.getItem('paydown:sample:v3')).not.toContain('3200000');

    await act(async () => buttonByText(first.container, 'Remove from this device')?.click());
    const dialog = first.container.querySelector('[role="alertdialog"]') as HTMLElement;
    await act(async () => buttonByText(dialog, 'Remove')?.click());
    await vi.waitFor(() => expect(sidebar(first.container)).toContain('Sample loan'));
    expect(window.localStorage.getItem(MY_LOAN_STORAGE_KEY)).toBeNull();
    expect(inputByLabel(first.container, 'Amount borrowed').value).toBe('45,00,000');
  }, 30_000);

  async function createLoan(
    container: HTMLElement,
    passphrase: string,
    remember: boolean,
    fromSample = false,
  ) {
    act(() => buttonByText(container, 'Start my own loan')?.click());
    const dialog = container.querySelector('form[role="dialog"]') as HTMLFormElement;

    if (fromSample) {
      act(() => buttonByText(dialog, 'The sample as it is now')?.click());
    } else {
      setValue(inputByLabel(dialog, 'Loan name'), 'Home loan');
      setValue(inputByLabel(dialog, 'Lender'), 'Private Lender');
      setValue(inputByLabel(dialog, 'Amount borrowed'), '3500000');
      setValue(inputByLabel(dialog, 'Starting rate'), '8.4');
      setValue(inputByLabel(dialog, 'Original term'), '180');
      setValue(inputByLabel(dialog, 'First EMI'), '2024-06-05');
    }
    setValue(inputByLabel(dialog, 'Passphrase'), passphrase);
    setValue(inputByLabel(dialog, 'Repeat passphrase'), passphrase);
    if (remember) {
      act(() => (dialog.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    }

    await act(async () => dialog.requestSubmit());
    await vi.waitFor(() => expect(container.textContent).toContain('Your loan is open'), {
      timeout: 10_000,
    });
  }

  function expectNoPlaintext() {
    const everything = JSON.stringify({ ...window.localStorage });
    expect(everything).not.toContain('Private Lender');
    expect(everything).not.toContain('Home loan');
    expect(everything).not.toContain('3500000');
  }
});

function mount(
  keyStore: DeviceKeyStore,
  vaultAvailable = true,
  myKeyStore: DeviceKeyStore = createMemoryKeyStore(),
) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(
      <App
        iterations={MIN_ITERATIONS}
        keyStore={keyStore}
        myKeyStore={myKeyStore}
        vaultAvailable={vaultAvailable}
        vaultSource={() => Promise.resolve(JSON.parse(JSON.stringify(blob)))}
      />,
    );
  });

  mounted = { container, root };
  return mounted;
}

async function submitDialog(container: HTMLElement, passphrase: string) {
  setValue(container.querySelector('#unlock-passphrase') as HTMLInputElement, passphrase);
  await act(async () => {
    (container.querySelector('form[role="dialog"]') as HTMLFormElement).requestSubmit();
  });
}

function setValue(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function inputByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const element = Array.from(container.querySelectorAll('label')).find(
    (item) => item.textContent === label,
  );
  return document.getElementById(element?.htmlFor ?? '') as HTMLInputElement;
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
    buttonByText(container, 'Unlock set a')?.click();
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
