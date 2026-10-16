import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { sampleLoan } from '../../src/config/sampleLoan';
import { buildLoanAnalysis } from '../../src/features/loan/loanEngine';
import { SchedulePage } from '../../src/pages/SchedulePage';

describe('amortization schedule reconciliation', () => {
  test('shows every interest component included in total outflow', () => {
    const markup = renderToStaticMarkup(
      <SchedulePage analysis={buildLoanAnalysis(sampleLoan.loan, '2026-07-02')} />,
    );

    expect(markup).toContain('Principal through EMIs');
    expect(markup).toContain('Regular interest');
    expect(markup).toContain('Simple interest');
    expect(markup).toContain('Pre-EMI interest');
    expect(markup).toContain('All principal and interest charges');
    expect(markup).toContain('aria-label="Filter schedule by year"');
  });
});
