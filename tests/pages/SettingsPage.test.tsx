import { act } from 'react';
import { describe, expect, test, vi } from 'vitest';

import type { DatasetId } from '../../src/app/App';
import type { AppearancePrefs } from '../../src/app/storage';
import { sampleLoan } from '../../src/config/sampleLoan';
import { buildLoanAnalysis } from '../../src/features/loan/loanEngine';
import type { LoanProfile } from '../../src/features/vault/loanProfile';
import { SettingsPage } from '../../src/pages/SettingsPage';
import { blur, buttonByText, click, render, setInputValue } from '../render';

function page(
  overrides: {
    onResetData?: () => void;
    onPrefsChange?: (prefs: AppearancePrefs) => void;
    onProfileChange?: (profile: LoanProfile) => void;
    onOpenLink?: (text: string) => void;
    onShareLink?: () => Promise<string>;
    onRemoveMyLoan?: () => Promise<void>;
    datasetId?: DatasetId;
    hasMyLoan?: boolean;
  } = {},
) {
  return (
    <SettingsPage
      analysis={buildLoanAnalysis(sampleLoan.loan, '2026-07-02')}
      profile={sampleLoan}
      datasetId={overrides.datasetId ?? 'sample'}
      vaultAvailable
      hasMyLoan={overrides.hasMyLoan ?? false}
      prefs={{ theme: 'dark', palette: 'carbon' }}
      onPrefsChange={overrides.onPrefsChange ?? (() => undefined)}
      onProfileChange={overrides.onProfileChange ?? (() => undefined)}
      onResetData={overrides.onResetData ?? (() => undefined)}
      onUnlock={() => Promise.resolve()}
      onLock={() => Promise.resolve()}
      onUnlockMine={() => undefined}
      onCreateMyLoan={() => Promise.resolve()}
      onOpenLink={overrides.onOpenLink ?? (() => undefined)}
      onShareLink={overrides.onShareLink ?? (() => Promise.resolve('https://x.test/#open=abc'))}
      onRemoveMyLoan={overrides.onRemoveMyLoan ?? (() => Promise.resolve())}
    />
  );
}

function inputByLabel(container: HTMLElement, label: string): HTMLInputElement {
  const element = Array.from(container.querySelectorAll('label')).find(
    (item) => item.textContent === label,
  );
  return document.getElementById(element?.htmlFor ?? '') as HTMLInputElement;
}

describe('settings', () => {
  test('asks in its own dialog before restoring default data, and keeps the theme', () => {
    const confirm = vi.spyOn(window, 'confirm');
    const onResetData = vi.fn();
    const { container, cleanup } = render(page({ onResetData }));
    const button = buttonByText(container, 'Restore default data');
    const dialog = () => container.querySelector<HTMLElement>('[role="alertdialog"]');

    expect(container.textContent).toContain('Your theme stays as it is.');
    expect(button?.className).toContain('btn-quiet-danger');

    click(button);
    expect(dialog()?.textContent).toContain('Restore the default data?');
    click(buttonByText(dialog() as HTMLElement, 'Cancel'));
    expect(dialog()).toBeNull();
    expect(onResetData).not.toHaveBeenCalled();

    click(button);
    act(() => {
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    });
    expect(dialog()).toBeNull();

    click(button);
    click(buttonByText(dialog() as HTMLElement, 'Restore default data'));
    expect(onResetData).toHaveBeenCalledTimes(1);
    expect(dialog()).toBeNull();
    expect(confirm).not.toHaveBeenCalled();

    confirm.mockRestore();
    cleanup();
  });

  test('shows the terms in editable fields and warns that the sample is plain text', () => {
    const { container, cleanup } = render(page());
    const text = container.textContent ?? '';

    expect(text).toContain('Sample loan from Sample Bank');
    expect(text).toContain("don't type your real loan here");
    expect(inputByLabel(container, 'Amount borrowed').value).toBe('45,00,000');
    expect(inputByLabel(container, 'Starting rate').value).toBe('9.15');
    expect(inputByLabel(container, 'Original term').value).toBe('240');
    expect(inputByLabel(container, 'First EMI').value).toBe('2023-04-01');
    expect(text).toContain('20 yr (240 EMIs)');
    expect(text).toContain('The 1st of each month');
    expect(buttonByText(container, 'Unlock set a')).toBeTruthy();
    cleanup();
  });

  test('commits a valid term and refuses a first EMI after the first event', () => {
    const onProfileChange = vi.fn();
    const { container, cleanup } = render(page({ onProfileChange }));

    setInputValue(inputByLabel(container, 'Starting rate'), '8.5');
    expect(onProfileChange).toHaveBeenLastCalledWith(
      expect.objectContaining({ loan: expect.objectContaining({ originalRate: 8.5 }) }),
    );

    setInputValue(inputByLabel(container, 'Starting rate'), '45');
    expect(container.textContent).toContain('Use a rate from 1% to 30%.');

    const start = inputByLabel(container, 'First EMI');
    act(() => start.focus());
    setInputValue(start, '2025-01-01');
    blur(start);
    expect(onProfileChange).toHaveBeenCalledTimes(1);
    expect(container.textContent).toContain(
      'The first EMI must be on or before 1 Nov 2023, the first rate change or part payment.',
    );

    const name = inputByLabel(container, 'Loan name');
    act(() => name.focus());
    setInputValue(name, '   ');
    expect(container.textContent).toContain('Use 1 to 60 characters.');
    blur(name);
    expect(onProfileChange).toHaveBeenCalledTimes(1);
    cleanup();
  });

  test('offers to start or open your own loan when there is none', () => {
    const onOpenLink = vi.fn();
    const { container, cleanup } = render(page({ onOpenLink }));

    expect(container.textContent).toContain('Keep your own loan here, encrypted');
    expect(buttonByText(container, 'Start my own loan')).toBeTruthy();
    expect(buttonByText(container, 'Remove from this device')).toBeUndefined();

    click(buttonByText(container, 'Open a link'));
    const field = container.querySelector('#paste-link') as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')?.set;
    act(() => {
      setter?.call(field, 'just some text');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => (field.form as HTMLFormElement).requestSubmit());
    expect(container.textContent).toContain("That isn't a Paydown loan link.");
    expect(onOpenLink).not.toHaveBeenCalled();

    act(() => {
      setter?.call(field, ' https://example.test/paydown/#open=AbC_-9 ');
      field.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => (field.form as HTMLFormElement).requestSubmit());
    expect(onOpenLink).toHaveBeenCalledWith('AbC_-9');
    cleanup();
  });

  test('the create dialog refuses short or different passphrases and fills in a suggestion', () => {
    const { container, cleanup } = render(page());
    click(buttonByText(container, 'Start my own loan'));
    const dialog = container.querySelector('form[role="dialog"]') as HTMLFormElement;

    act(() => dialog.requestSubmit());
    expect(dialog.textContent).toContain('Use at least 20 characters.');
    expect(dialog.textContent).toContain('Pick the date of your first EMI.');

    click(buttonByText(dialog, 'Suggest one'));
    const suggestion = dialog.querySelector('.suggested-passphrase code')?.textContent ?? '';
    expect(suggestion).toMatch(/^[a-z2-9]{4}(-[a-z2-9]{4}){4}$/);
    expect(inputByLabel(dialog, 'Passphrase').value).toBe(suggestion);
    expect(inputByLabel(dialog, 'Repeat passphrase').value).toBe(suggestion);
    expect(dialog.textContent).not.toContain('Use at least 20 characters.');

    click(buttonByText(dialog, 'The sample as it is now'));
    expect(inputByLabel(dialog, 'Lender').value).toBe('Sample Bank');
    expect(dialog.textContent).toContain('The sample then goes back to its made-up figures.');
    cleanup();
  });

  test('when your loan is open, copies a link and warns about the passphrase', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText } });
    const { container, cleanup } = render(page({ datasetId: 'mine', hasMyLoan: true }));

    expect(container.textContent).toContain('Your loan is open');
    expect(buttonByText(container, 'Restore default data')).toBeUndefined();

    await act(async () => buttonByText(container, 'Copy link')?.click());
    expect(writeText).toHaveBeenCalledWith('https://x.test/#open=abc');
    expect(container.textContent).toContain('Link copied');
    expect(container.textContent).toContain('Send the passphrase some other way');
    expect(container.querySelector<HTMLInputElement>('.shared-link input')?.value).toBe(
      'https://x.test/#open=abc',
    );

    Reflect.deleteProperty(navigator, 'clipboard');
    cleanup();
  });

  test('asks before removing your loan from this device', () => {
    const onRemoveMyLoan = vi.fn(() => Promise.resolve());
    const { container, cleanup } = render(page({ hasMyLoan: true, onRemoveMyLoan }));

    expect(container.textContent).toContain('Your loan is locked');
    click(buttonByText(container, 'Remove from this device'));
    const dialog = container.querySelector<HTMLElement>('[role="alertdialog"]');
    expect(dialog?.textContent).toContain("This can't be undone.");
    click(buttonByText(dialog as HTMLElement, 'Remove'));
    expect(onRemoveMyLoan).toHaveBeenCalledTimes(1);
    cleanup();
  });

  test('switches theme and palette with toggle buttons', () => {
    const onPrefsChange = vi.fn();
    const { container, cleanup } = render(page({ onPrefsChange }));

    expect(buttonByText(container, 'Dark')?.getAttribute('aria-pressed')).toBe('true');
    click(buttonByText(container, 'Light'));
    click(buttonByText(container, 'Cocoa'));

    expect(onPrefsChange).toHaveBeenNthCalledWith(1, { theme: 'light', palette: 'carbon' });
    expect(onPrefsChange).toHaveBeenNthCalledWith(2, { theme: 'dark', palette: 'cocoa' });
    cleanup();
  });
});
