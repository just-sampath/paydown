import { describe, expect, test } from 'vitest';

import { sampleLoan } from '../../src/config/sampleLoan';
import { buildLoanAnalysis } from '../../src/features/loan/loanEngine';
import { PaidProgressPanel } from '../../src/components/PaidProgress';
import { render } from '../render';

const analysis = buildLoanAnalysis(sampleLoan.loan, '2026-08-15');

describe('loan progress card', () => {
  test('splits principal, interest and everything paid into so far and still to pay', () => {
    const { container, cleanup } = render(<PaidProgressPanel analysis={analysis} />);
    const text = container.textContent ?? '';

    expect(text).toContain('19.9% of the principal is repaid');
    expect(text).toContain('₹8.95L repaid');
    expect(text).toContain('Still owed₹36.05L');
    expect(text).toContain('Borrowed₹45L');
    expect(text).toContain('Still to come');
    expect(text).toContain('Everything you pay');
    expect(text).toContain('Still to pay');
    expect(text).toContain('Whole loan');
    expect(text).toContain('charged outside EMIs');
    expect(container.querySelectorAll('.meter-track')).toHaveLength(3);

    cleanup();
  });

  test('shows each figure once and opens no second view', () => {
    const { container, cleanup } = render(<PaidProgressPanel analysis={analysis} />);
    const text = container.textContent ?? '';
    const figures = text.match(/₹[\d.,]+[LK]?/g) ?? [];

    expect(new Set(figures).size).toBe(figures.length);
    expect(container.querySelector('button')).toBeNull();
    expect(container.querySelector('[role="dialog"]')).toBeNull();

    cleanup();
  });
});
