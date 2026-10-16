import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

import { sampleLoan } from '../../src/config/sampleLoan';
import { buildLoanAnalysis } from '../../src/features/loan/loanEngine';
import { WhatIfPage } from '../../src/pages/WhatIfPage';

const analysis = buildLoanAnalysis(sampleLoan.loan, '2026-07-02');

describe('what-if page', () => {
  test('shows money saved in the extra outcome hero stat', () => {
    const markup = renderToStaticMarkup(
      <WhatIfPage
        analysis={analysis}
        baseConfig={sampleLoan.loan}
        onAddScenario={() => undefined}
        onChange={() => undefined}
        scenarios={[]}
      />,
    );

    expect(markup).toContain('Extra saved');
    expect(markup).toContain('0 mo');
    expect(markup).toContain('₹0 interest saved');
  });

  test('does not commit incomplete scenario events', () => {
    const onChange = vi.fn();
    const scenario = {
      id: 'scenario-a',
      name: 'Scenario A',
      color: '#B8A3F0',
      partPayments: [{ date: '2026-09-01', amount: 100_000 }],
      rateChanges: [{ date: '2026-09-01', rate: 7 }],
    };
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);

    act(() => {
      root.render(
        <WhatIfPage
          analysis={analysis}
          baseConfig={sampleLoan.loan}
          onAddScenario={() => undefined}
          onChange={onChange}
          scenarios={[scenario]}
        />,
      );
    });

    const date = container.querySelector('input[type="date"]') as HTMLInputElement;
    const amount = container.querySelector('input[type="number"]') as HTMLInputElement;
    setInputValue(date, '');
    setInputValue(amount, '');

    expect(onChange).not.toHaveBeenCalled();
    expect(date.value).toBe('');
    expect(amount.value).toBe('');

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
