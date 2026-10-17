import { describe, expect, test, vi } from 'vitest';

import { sampleLoan } from '../../src/config/sampleLoan';
import { buildLoanAnalysis, type RateChange } from '../../src/features/loan/loanEngine';
import { RateChangesPage } from '../../src/pages/RateChangesPage';
import { blur, buttonByText, click, focus, render, setInputValue } from '../render';

const analysis = buildLoanAnalysis(sampleLoan.loan, '2026-08-15');
const rates = sampleLoan.loan.rateChanges;

function page(onChange: (rateChanges: RateChange[]) => void, rateChanges = rates) {
  return <RateChangesPage analysis={analysis} onChange={onChange} rateChanges={rateChanges} />;
}

describe('rate changes page', () => {
  test('explains the counterfactual and totals the rows', () => {
    const { container, cleanup } = render(page(() => undefined));
    const text = container.textContent ?? '';

    expect(text).toContain('If the rate had never changed');
    expect(text).toContain('1 yr 3 mo longer');
    expect(text).toContain('₹6.15L more interest, with the same part payments');
    expect(text).toContain('₹40,923');
    expect(text).toContain('All 3 changes');
    expect(text).toContain('1 yr 10 mo shorter');
    expect(text).toContain('Part payments page');
    expect(text).toContain('How your rate moved');
    expect(text).not.toContain('9.15% to 8.35%');

    cleanup();
  });

  test('keeps the same input while typing, so focus is never lost', () => {
    const onChange = vi.fn();
    const view = render(page(onChange));
    const input = view.container.querySelector<HTMLInputElement>(
      'input[aria-label="New rate for change 1"]',
    ) as HTMLInputElement;

    focus(input);
    setInputValue(input, '8');
    const committed = onChange.mock.calls.at(-1)?.[0] as RateChange[];
    view.rerender(page(onChange, committed));
    setInputValue(input, '8.');
    setInputValue(input, '8.4');

    expect(view.container.contains(input)).toBe(true);
    expect(input.value).toBe('8.4');
    expect(onChange).toHaveBeenLastCalledWith(
      expect.arrayContaining([expect.objectContaining({ date: '2023-11-01', rate: 8.4 })]),
    );

    view.cleanup();
  });

  test('keeps incomplete edits local and commits a date only when the field is left', () => {
    const onChange = vi.fn();
    const { container, cleanup } = render(page(onChange));
    const date = container.querySelector<HTMLInputElement>(
      'input[type="date"]',
    ) as HTMLInputElement;
    const rate = container.querySelector<HTMLInputElement>(
      'input[aria-label="New rate for change 1"]',
    ) as HTMLInputElement;

    focus(date);
    setInputValue(date, '');
    setInputValue(rate, '');
    expect(onChange).not.toHaveBeenCalled();
    expect(date.value).toBe('');
    expect(rate.value).toBe('');

    focus(date);
    setInputValue(date, '2023-12-01');
    expect(onChange).not.toHaveBeenCalled();
    blur(date);
    expect(onChange).toHaveBeenCalledTimes(1);

    cleanup();
  });

  test('deletes a change and puts it back with Undo', () => {
    const onChange = vi.fn();
    const view = render(page(onChange));

    click(view.container.querySelector<HTMLButtonElement>('[aria-label="Delete rate change 2"]'));
    const afterDelete = onChange.mock.calls.at(-1)?.[0] as RateChange[];
    expect(afterDelete).toHaveLength(2);

    view.rerender(page(onChange, afterDelete));
    expect(view.container.textContent).toContain('removed');
    click(buttonByText(view.container, 'Undo'));
    expect(onChange.mock.calls.at(-1)?.[0]).toEqual(rates);

    view.cleanup();
  });

  test('refuses 0%, rates above 30%, and a rate that is already in effect', () => {
    const onChange = vi.fn();
    const { container, cleanup } = render(page(onChange));
    const row = container.querySelector<HTMLInputElement>(
      'input[aria-label="New rate for change 1"]',
    ) as HTMLInputElement;
    const value = container.querySelector('#new-rate-value') as HTMLInputElement;
    const submit = buttonByText(container, 'Add rate change') as HTMLButtonElement;

    focus(row);
    setInputValue(row, '0');
    setInputValue(row, '45');
    expect(onChange).not.toHaveBeenCalled();
    expect(row.getAttribute('aria-invalid')).toBe('true');
    expect(container.textContent).toContain('Use a rate from 1% to 30%.');
    blur(row);
    expect(row.value).toBe('8.95');
    expect(container.textContent).not.toContain('Use a rate from 1% to 30%.');

    setInputValue(value, '0');
    expect(submit.disabled).toBe(true);
    expect(container.textContent).toContain('Use a rate from 1% to 30%.');

    setInputValue(value, '8.35');
    expect(submit.disabled).toBe(true);
    expect(container.textContent).toContain('The rate is already 8.35% on that date.');

    setInputValue(container.querySelector('#new-rate-date') as HTMLInputElement, '2025-06-01');
    setInputValue(value, '8.1');
    expect(submit.disabled).toBe(true);
    expect(container.textContent).toContain('There is already a rate change on that date.');

    cleanup();
  });

  test('adds a change only after a rate is typed', () => {
    const onChange = vi.fn();
    const { container, cleanup } = render(page(onChange));
    const submit = buttonByText(container, 'Add rate change') as HTMLButtonElement;

    expect(submit.disabled).toBe(true);
    setInputValue(container.querySelector('#new-rate-value') as HTMLInputElement, '7.9');
    click(submit);

    expect(onChange).toHaveBeenCalledWith([...rates, { date: '2026-09-01', rate: 7.9 }]);
    cleanup();
  });
});
