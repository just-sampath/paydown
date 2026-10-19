import { describe, expect, test, vi } from 'vitest';

import type { WhatIfScenario } from '../../src/app/storage';
import { sampleLoan } from '../../src/config/sampleLoan';
import { buildLoanAnalysis } from '../../src/features/loan/loanEngine';
import { WhatIfPage } from '../../src/pages/WhatIfPage';
import { buttonByText, click, focus, render, setInputValue } from '../render';

const analysis = buildLoanAnalysis(sampleLoan.loan, '2026-07-02');

const scenario: WhatIfScenario = {
  id: 'scenario-a',
  name: 'Scenario A',
  color: '#8B6FE0',
  partPayments: [{ date: '2026-09-01', amount: 100_000 }],
  rateChanges: [{ date: '2026-09-01', rate: 7 }],
};

function page(onChange: (scenarios: WhatIfScenario[]) => void, scenarios: WhatIfScenario[]) {
  return (
    <WhatIfPage
      analysis={analysis}
      baseConfig={sampleLoan.loan}
      onChange={onChange}
      scenarios={scenarios}
    />
  );
}

describe('what-if page', () => {
  test('offers starting points when there are no scenarios', () => {
    const onChange = vi.fn();
    const { container, cleanup } = render(page(onChange, []));

    expect(container.textContent).toContain('No scenarios yet');
    expect(container.textContent).not.toContain('Every plan side by side');
    expect(buttonByText(container, 'Pay ₹1,00,000 extra next month')?.className).toContain(
      'btn-primary',
    );
    expect(buttonByText(container, 'Empty scenario')?.className).not.toContain('btn-primary');
    click(buttonByText(container, 'Pay ₹1,00,000 extra next month'));

    const created = onChange.mock.calls[0]?.[0] as WhatIfScenario[];
    expect(created).toHaveLength(1);
    expect(created[0]?.partPayments).toEqual([{ date: '2026-08-01', amount: 100_000 }]);
    expect(created[0]?.name).toBe('₹1L extra in Aug 2026');
    cleanup();
  });

  test('keeps the result next to the inputs and compares every plan below them', () => {
    const { container, cleanup } = render(page(() => undefined, [scenario]));
    const text = container.textContent ?? '';
    const row = container.querySelector('tr[aria-current="true"]');
    const outcome = container.querySelector('.scenario-outcome');
    const firstForm = container.querySelector('form');
    const table = container.querySelector('table');

    expect(row?.textContent).toContain('Scenario A');
    expect(row?.textContent).toMatch(/sooner, ₹[\d.]+L less interest/);
    expect(row?.className).toContain('is-active-row');
    expect(outcome?.getAttribute('role')).toBe('status');
    expect(outcome?.textContent).toMatch(/sooner, ₹[\d.]+L less interest than your current plan/);
    expect(text).toContain('Your plan today');
    expect(text).toContain('Adds 1 part payment and 1 rate change to your real ones.');
    // Result, then the inputs, then the full comparison.
    expect(outcome?.compareDocumentPosition(firstForm as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    expect(firstForm?.compareDocumentPosition(table as Node)).toBe(
      Node.DOCUMENT_POSITION_FOLLOWING,
    );
    cleanup();
  });

  test('selects a new scenario as soon as it is created', () => {
    const onChange = vi.fn();
    const view = render(page(onChange, [scenario]));

    click(buttonByText(view.container, 'New scenario'));
    const next = onChange.mock.calls.at(-1)?.[0] as WhatIfScenario[];
    view.rerender(page(onChange, next));

    const selected = view.container.querySelector('[role="tab"][aria-selected="true"]');
    expect(selected?.textContent).toBe('Scenario B');
    expect((view.container.querySelector('#scenario-name') as HTMLInputElement).value).toBe(
      'Scenario B',
    );
    view.cleanup();
  });

  test('deletes a scenario at once and puts it back with Undo', () => {
    const confirm = vi.spyOn(window, 'confirm');
    const onChange = vi.fn();
    const view = render(page(onChange, [scenario]));

    click(buttonByText(view.container, 'Delete scenario'));
    expect(onChange).toHaveBeenLastCalledWith([]);
    view.rerender(page(onChange, []));

    expect(view.container.textContent).toContain('Scenario A deleted.');
    expect(document.activeElement?.textContent).toContain('Undo');
    click(buttonByText(view.container, 'Undo'));
    expect(onChange).toHaveBeenLastCalledWith([scenario]);
    expect(confirm).not.toHaveBeenCalled();

    confirm.mockRestore();
    view.cleanup();
  });

  test('refuses a pretend rate that is already in effect or out of range', () => {
    const { container, cleanup } = render(page(() => undefined, [scenario]));
    const value = container.querySelector('#scenario-rate-value') as HTMLInputElement;
    const submit = buttonByText(container, 'Add rate') as HTMLButtonElement;

    setInputValue(value, '0');
    expect(submit.disabled).toBe(true);
    expect(container.textContent).toContain('Use a rate from 1% to 30%.');

    setInputValue(value, '8.35');
    expect(submit.disabled).toBe(true);
    expect(container.textContent).toContain('The rate is already 8.35% on that date.');

    setInputValue(value, '7.5');
    expect(submit.disabled).toBe(false);
    cleanup();
  });

  test('does not commit incomplete scenario events', () => {
    const onChange = vi.fn();
    const { container, cleanup } = render(page(onChange, [scenario]));
    const date = container.querySelector(
      'input[aria-label="Date of scenario payment 1"]',
    ) as HTMLInputElement;
    const amount = container.querySelector(
      'input[aria-label="Amount of scenario payment 1"]',
    ) as HTMLInputElement;

    focus(date);
    setInputValue(date, '');
    focus(amount);
    setInputValue(amount, '');

    expect(onChange).not.toHaveBeenCalled();
    expect(amount.value).toBe('');
    cleanup();
  });
});
