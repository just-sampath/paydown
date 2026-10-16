import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { sampleLoan } from '../../src/config/sampleLoan';
import { buildLoanAnalysis } from '../../src/features/loan/loanEngine';
import { DashboardPage } from '../../src/pages/DashboardPage';

describe('dashboard financial context', () => {
  test('distinguishes principal outstanding from total remaining payments', () => {
    const markup = renderToStaticMarkup(
      <DashboardPage analysis={buildLoanAnalysis(sampleLoan.loan, '2026-08-15')} />,
    );

    expect(markup).toContain('Principal outstanding');
    expect(markup).toContain('As of 15 Aug 2026');
    expect(markup).toContain('137 payments remaining');
    expect(markup).toContain('₹56.03L scheduled');
  });

  test('renders a single full-loan progress card without inline breakdown detail', () => {
    const markup = renderToStaticMarkup(
      <DashboardPage analysis={buildLoanAnalysis(sampleLoan.loan, '2026-08-15')} />,
    );

    expect(markup).toContain('Loan progress');
    expect(markup).toContain('Original loan');
    expect(markup).toContain('Repaid');
    expect(markup).toContain('Left');
    expect(markup).toContain('data-loan-progress-trigger');
    expect(markup).not.toContain('One loan. The complete picture.');
    expect(markup).not.toContain('Interest paid');
    expect(markup).not.toContain('Extra interest charges');
  });
});
