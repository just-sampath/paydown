import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

import { sampleLoan } from '../../src/config/sampleLoan';
import { buildLoanAnalysis } from '../../src/features/loan/loanEngine';
import { RateChangesPage } from '../../src/pages/RateChangesPage';

const analysis = buildLoanAnalysis(sampleLoan.loan, '2026-08-15');

describe('rate changes page', () => {
  test('shows exact EMI instead of compact rounding in the rate trajectory panel', () => {
    const markup = renderToStaticMarkup(
      <RateChangesPage
        analysis={analysis}
        onChange={() => undefined}
        rateChanges={sampleLoan.loan.rateChanges}
      />,
    );

    expect(markup).toContain('EMI unchanged');
    expect(markup).toContain('₹40,923');
    expect(markup).not.toContain('₹41K');
    expect(markup).toContain('₹6.15L');
    expect(markup).toContain('same prepayments');
  });

  test('keeps incomplete rate edits local until they are valid', () => {
    const onChange = vi.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <RateChangesPage
          analysis={analysis}
          onChange={onChange}
          rateChanges={sampleLoan.loan.rateChanges}
        />,
      );
    });

    const date = container.querySelector('input[type="date"]') as HTMLInputElement;
    const rate = container.querySelector('input[type="number"]') as HTMLInputElement;

    setInputValue(date, '');
    setInputValue(rate, '');

    expect(onChange).not.toHaveBeenCalled();
    expect(date.value).toBe('');
    expect(rate.value).toBe('');

    act(() => root.unmount());
    container.remove();
  });
});

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
