import { act, type ReactElement } from 'react';
import { createRoot } from 'react-dom/client';
import { describe, expect, test, vi } from 'vitest';

import { sampleLoan } from '../../src/config/sampleLoan';
import { buildLoanAnalysis } from '../../src/features/loan/loanEngine';
import { PartPaymentsPage } from '../../src/pages/PartPaymentsPage';

const analysis = buildLoanAnalysis(sampleLoan.loan, '2026-07-02');

type RenderResult = {
  container: HTMLDivElement;
  cleanup: () => void;
};

function render(component: ReactElement): RenderResult {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);

  act(() => {
    root.render(component);
  });

  return {
    container,
    cleanup: () => {
      act(() => {
        root.unmount();
      });
      container.remove();
    },
  };
}

function setInputValue(input: HTMLInputElement, value: string): void {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;

  act(() => {
    setter?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('PartPaymentsPage inputs', () => {
  test('labels lifetime savings and exposes simple-interest charges', () => {
    const { container, cleanup } = render(
      <PartPaymentsPage
        analysis={analysis}
        partPayments={sampleLoan.loan.partPayments}
        onChange={() => undefined}
      />,
    );

    expect(container.textContent).toContain('Lifetime saving ratio');
    expect(container.textContent).toContain('Simple interest');
    expect(container.textContent).toContain('3.88×');
    expect(container.textContent).not.toContain('Effective ROI');
    cleanup();
  });

  test('does not crash or propagate when the amount is cleared or set to 0', () => {
    const onChange = vi.fn();
    const { container, cleanup } = render(
      <PartPaymentsPage
        analysis={analysis}
        partPayments={sampleLoan.loan.partPayments}
        onChange={onChange}
      />,
    );

    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;
    expect(amountInput).toBeTruthy();

    setInputValue(amountInput, '0');
    expect(onChange).not.toHaveBeenCalled();
    expect(container.textContent).toContain('Prepayment ledger');

    setInputValue(amountInput, '');
    expect(onChange).not.toHaveBeenCalled();
    expect(amountInput.value).toBe('');

    cleanup();
  });

  test('propagates only a valid positive amount', () => {
    const onChange = vi.fn();
    const { container, cleanup } = render(
      <PartPaymentsPage
        analysis={analysis}
        partPayments={sampleLoan.loan.partPayments}
        onChange={onChange}
      />,
    );

    const amountInput = container.querySelector('input[type="number"]') as HTMLInputElement;

    setInputValue(amountInput, '999999');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ amount: 999999 })]),
    );

    cleanup();
  });

  test('does not crash or propagate when the date is cleared', () => {
    const onChange = vi.fn();
    const { container, cleanup } = render(
      <PartPaymentsPage
        analysis={analysis}
        partPayments={sampleLoan.loan.partPayments}
        onChange={onChange}
      />,
    );

    const dateInput = container.querySelector('input[type="date"]') as HTMLInputElement;
    expect(dateInput).toBeTruthy();

    setInputValue(dateInput, '');
    expect(onChange).not.toHaveBeenCalled();
    expect(dateInput.value).toBe('');
    expect(container.textContent).toContain('Prepayment ledger');

    cleanup();
  });
});
