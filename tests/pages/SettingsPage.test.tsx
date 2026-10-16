import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

import { sampleLoan } from '../../src/config/sampleLoan';
import { buildLoanAnalysis } from '../../src/features/loan/loanEngine';
import { SettingsPage } from '../../src/pages/SettingsPage';

describe('settings data safety', () => {
  test('confirms before restoring default data', () => {
    const confirm = vi
      .spyOn(window, 'confirm')
      .mockReturnValueOnce(false)
      .mockReturnValueOnce(true);
    const onResetData = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <SettingsPage
          analysis={buildLoanAnalysis(sampleLoan.loan, '2026-07-02')}
          profile={sampleLoan}
          datasetId="sample"
          vaultAvailable
          prefs={{ theme: 'dark', palette: 'carbon' }}
          onPrefsChange={() => undefined}
          onResetData={onResetData}
          onUnlock={() => Promise.resolve()}
          onLock={() => Promise.resolve()}
        />,
      );
    });

    const button = Array.from(container.querySelectorAll('button')).find((item) =>
      item.textContent?.includes('Restore default data'),
    );
    expect(button).toBeTruthy();

    act(() => button?.click());
    expect(onResetData).not.toHaveBeenCalled();
    act(() => button?.click());
    expect(onResetData).toHaveBeenCalledTimes(1);

    confirm.mockRestore();
    act(() => root.unmount());
    container.remove();
  });

  test('shows the sample loan terms and an ambiguous unlock control', () => {
    const markup = renderToStaticMarkup(
      <SettingsPage
        analysis={buildLoanAnalysis(sampleLoan.loan, '2026-07-02')}
        profile={sampleLoan}
        datasetId="sample"
        vaultAvailable
        prefs={{ theme: 'dark', palette: 'carbon' }}
        onPrefsChange={() => undefined}
        onResetData={() => undefined}
        onUnlock={() => Promise.resolve()}
        onLock={() => Promise.resolve()}
      />,
    );

    expect(markup).toContain('Sample Bank');
    expect(markup).toContain('₹45,00,000');
    expect(markup).toContain('9.15%');
    expect(markup).toContain('20 yr');
    expect(markup).toContain('unlock set a');
  });
});
