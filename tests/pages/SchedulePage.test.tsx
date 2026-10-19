import { afterEach, describe, expect, test, vi } from 'vitest';

import { sampleLoan } from '../../src/config/sampleLoan';
import { buildLoanAnalysis } from '../../src/features/loan/loanEngine';
import { SchedulePage } from '../../src/pages/SchedulePage';
import { buttonByText, click, render } from '../render';

const analysis = buildLoanAnalysis(sampleLoan.loan, '2026-07-02');

describe('payment schedule', () => {
  test('breaks total paid into principal and interest components', () => {
    const { container, cleanup } = render(<SchedulePage analysis={analysis} />);
    const text = container.textContent ?? '';

    expect(text).toContain('₹40.6L through EMIs, ₹4.4L in part payments');
    expect(text).toContain('₹32.21L EMI interest, ₹12K interest outside EMIs');
    expect(text).toContain('Total paid');
    expect(text).toContain('Principal plus interest');
    expect(text).toContain('62 fewer than the original 240');

    cleanup();
  });

  test('opens the year with the next EMI, marks it, and opens other years on demand', () => {
    const { container, cleanup } = render(<SchedulePage analysis={analysis} />);

    expect(container.textContent).toContain('Jul 2026');
    const next = container.querySelector('[aria-current="date"]');
    expect(next?.textContent).toContain('Aug 2026');
    // The label stays on narrow screens too, so the row isn't marked by colour alone.
    expect(next?.querySelector('.chip-next')?.className).not.toContain('only-wide');
    expect(container.textContent).not.toContain('Jan 2030');

    const year2030 = Array.from(container.querySelectorAll<HTMLButtonElement>('.year-button')).find(
      (button) => button.textContent?.includes('2030'),
    );
    expect(year2030?.getAttribute('aria-expanded')).toBe('false');
    click(year2030);
    expect(year2030?.getAttribute('aria-expanded')).toBe('true');
    expect(container.textContent).toContain('Jan 2030');

    cleanup();
  });

  test('Go to next EMI reopens its year and scrolls to that row', () => {
    const scrollIntoView = vi.fn();
    Element.prototype.scrollIntoView = scrollIntoView;
    const frames: FrameRequestCallback[] = [];
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.push(callback);
      return frames.length;
    });
    const { container, cleanup } = render(<SchedulePage analysis={analysis} />);
    const year2026 = Array.from(container.querySelectorAll<HTMLButtonElement>('.year-button')).find(
      (button) => button.textContent?.includes('2026'),
    );

    click(year2026);
    expect(container.querySelector('#emi-41')).toBeNull();

    click(buttonByText(container, 'Go to next EMI'));
    frames.forEach((frame) => frame(0));
    const row = container.querySelector('#emi-41');
    expect(row?.getAttribute('aria-current')).toBe('date');
    expect(scrollIntoView).toHaveBeenCalledWith(expect.objectContaining({ block: 'center' }));
    expect(scrollIntoView.mock.contexts[0]).toBe(row);

    cleanup();
  });

  test('shows the rate on the first EMI and on months it changed, not on every row', () => {
    const { container, cleanup } = render(<SchedulePage analysis={analysis} />);

    click(buttonByText(container, 'Open all years'));
    const rateCells = Array.from(
      container.querySelectorAll<HTMLTableCellElement>('.month-row td:last-child'),
    )
      .map((cell) => cell.textContent)
      .filter(Boolean);

    expect(rateCells).toEqual(['9.15%', '8.95%', '8.65%', '8.35%']);
    cleanup();
  });
});

afterEach(() => {
  vi.restoreAllMocks();
});
