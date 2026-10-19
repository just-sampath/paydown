import { describe, expect, test, vi } from 'vitest';

import { sampleLoan } from '../../src/config/sampleLoan';
import { buildLoanAnalysis, type PartPayment } from '../../src/features/loan/loanEngine';
import { PartPaymentsPage } from '../../src/pages/PartPaymentsPage';
import { blur, buttonByText, click, focus, render, setInputValue } from '../render';

const analysis = buildLoanAnalysis(sampleLoan.loan, '2026-07-02');
const payments = sampleLoan.loan.partPayments;

function page(onChange: (partPayments: PartPayment[]) => void) {
  return <PartPaymentsPage analysis={analysis} onChange={onChange} partPayments={payments} />;
}

function amountInput(container: HTMLElement): HTMLInputElement {
  return container.querySelector(
    'input[aria-label="Amount of part payment 1"]',
  ) as HTMLInputElement;
}

describe('part payments page', () => {
  test('shows what each rupee saved and the interest charged on part payments', () => {
    const { container, cleanup } = render(page(() => undefined));
    const text = container.textContent ?? '';

    expect(text).toContain('Saved per ₹1');
    expect(text).toContain('₹3.88');
    expect(text).toContain('3 yr longer without them');
    expect(text).toContain('Best value');
    expect(text).toContain('Feb 2024');
    expect(text).toContain('It saved the most interest for each rupee. Its row is marked below.');
    expect(text).toContain('Part-payment interest');
    expect(text).toContain('All 3 payments');
    expect(text).not.toContain('Effective ROI');
    expect(text.split('₹3.88').length - 1).toBe(1);
    expect(text.split('₹1,040').length - 1).toBe(1);
    cleanup();
  });

  test('shows amounts with Indian grouping until the field is edited', () => {
    const { container, cleanup } = render(page(() => undefined));
    const input = amountInput(container);

    expect(input.value).toBe('1,25,000');
    focus(input);
    expect(input.value).toBe('125000');
    cleanup();
  });

  test('does not propagate a cleared amount or one below ₹1', () => {
    const onChange = vi.fn();
    const { container, cleanup } = render(page(onChange));
    const input = amountInput(container);

    focus(input);
    setInputValue(input, '0');
    expect(container.textContent).toContain('Enter an amount of at least ₹1.');
    setInputValue(input, '');
    expect(onChange).not.toHaveBeenCalled();
    expect(input.value).toBe('');

    blur(input);
    expect(input.value).toBe('1,25,000');
    cleanup();
  });

  test('propagates a valid amount, with or without commas', () => {
    const onChange = vi.fn();
    const { container, cleanup } = render(page(onChange));
    const input = amountInput(container);

    focus(input);
    setInputValue(input, '9,99,999');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(onChange).toHaveBeenCalledWith(
      expect.arrayContaining([expect.objectContaining({ amount: 999999 })]),
    );
    cleanup();
  });

  test('does not propagate a cleared date', () => {
    const onChange = vi.fn();
    const { container, cleanup } = render(page(onChange));
    const date = container.querySelector('input[type="date"]') as HTMLInputElement;

    focus(date);
    setInputValue(date, '');
    blur(date);
    expect(onChange).not.toHaveBeenCalled();
    expect(date.value).toBe(payments[0]?.date);
    cleanup();
  });

  test('marks the best-value payment in its own row', () => {
    const { container, cleanup } = render(page(() => undefined));
    const best = container.querySelectorAll('.event-row.is-best');

    expect(best).toHaveLength(1);
    expect((best[0]?.querySelector('input[type="date"]') as HTMLInputElement).value).toBe(
      '2024-02-14',
    );
    expect(best[0]?.textContent).toContain('Best value');
    cleanup();
  });

  test('shows an example amount beside the label, never inside the empty field', () => {
    const { container, cleanup } = render(page(() => undefined));
    const field = container.querySelector('#new-payment-value') as HTMLInputElement;

    expect(field.value).toBe('');
    expect(field.placeholder).toBe('');
    expect(container.querySelector('#new-payment-example')?.textContent).toBe(
      'for example 1,00,000',
    );
    expect(field.getAttribute('aria-describedby')).toBe('new-payment-example');
    cleanup();
  });

  test('adds a payment from the form', () => {
    const onChange = vi.fn();
    const { container, cleanup } = render(page(onChange));

    setInputValue(container.querySelector('#new-payment-value') as HTMLInputElement, '50,000');
    click(buttonByText(container, 'Add part payment'));

    expect(onChange).toHaveBeenCalledWith([...payments, { date: '2026-08-01', amount: 50_000 }]);
    cleanup();
  });
});
