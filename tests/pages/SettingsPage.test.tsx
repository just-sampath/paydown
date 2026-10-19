import { act } from 'react';
import { describe, expect, test, vi } from 'vitest';

import type { AppearancePrefs } from '../../src/app/storage';
import { sampleLoan } from '../../src/config/sampleLoan';
import { buildLoanAnalysis } from '../../src/features/loan/loanEngine';
import { SettingsPage } from '../../src/pages/SettingsPage';
import { buttonByText, click, render } from '../render';

function page(overrides: {
  onResetData?: () => void;
  onPrefsChange?: (prefs: AppearancePrefs) => void;
}) {
  return (
    <SettingsPage
      analysis={buildLoanAnalysis(sampleLoan.loan, '2026-07-02')}
      profile={sampleLoan}
      datasetId="sample"
      vaultAvailable
      prefs={{ theme: 'dark', palette: 'carbon' }}
      onPrefsChange={overrides.onPrefsChange ?? (() => undefined)}
      onResetData={overrides.onResetData ?? (() => undefined)}
      onUnlock={() => Promise.resolve()}
      onLock={() => Promise.resolve()}
    />
  );
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

  test('shows loan terms as text, not as inputs that look editable', () => {
    const { container, cleanup } = render(page({}));
    const text = container.textContent ?? '';

    expect(text).toContain('Sample loan from Sample Bank');
    expect(text).toContain('₹45,00,000');
    expect(text).toContain('9.15%, floating');
    expect(text).toContain('20 yr (240 EMIs)');
    expect(text).toContain('The 1st of each month');
    expect(container.querySelectorAll('input')).toHaveLength(0);
    expect(buttonByText(container, 'Unlock set a')).toBeTruthy();
    expect(text).toContain('Set a is a private loan you can open with its passphrase.');
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
