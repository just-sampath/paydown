import type { LoanProfile } from '../features/vault/loanProfile';

/** Says, wherever the sample loan is shown, that its figures are not real. */
export const SAMPLE_NOTE = 'Sample loan with made-up numbers';

/**
 * Fictional loan shown to every visitor. None of these figures belong to a real borrower.
 */
export const sampleLoan: LoanProfile = {
  schema: 1,
  meta: {
    name: 'Sample loan',
    lender: 'Sample Bank',
    rateType: 'floating',
  },
  loan: {
    principal: 4_500_000,
    originalRate: 9.15,
    tenureMonths: 240,
    startDate: '2023-04-01',
    preEmiInterest: 11_200,
    rateChanges: [
      { date: '2023-11-01', rate: 8.95 },
      { date: '2024-07-01', rate: 8.65 },
      { date: '2025-06-01', rate: 8.35 },
    ],
    partPayments: [
      { date: '2024-02-14', amount: 125_000 },
      { date: '2024-10-09', amount: 75_000 },
      { date: '2025-08-12', amount: 240_000 },
    ],
  },
  scenarios: [],
};
