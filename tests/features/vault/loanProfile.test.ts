import { describe, expect, test } from 'vitest';

import { sampleLoan } from '../../../src/config/sampleLoan';
import { LoanProfileError, parseLoanProfile } from '../../../src/features/vault/loanProfile';

describe('loan profile', () => {
  test('accepts the sample loan and returns an equal copy', () => {
    const parsed = parseLoanProfile(JSON.parse(JSON.stringify(sampleLoan)));

    expect(parsed).toEqual(sampleLoan);
    expect(parsed).not.toBe(sampleLoan);
  });

  test('labels the sample loan as fictional', () => {
    expect(sampleLoan.meta.name).toBe('Sample loan');
    expect(sampleLoan.meta.lender).toBe('Sample Bank');
  });

  test('drops unknown fields', () => {
    const parsed = parseLoanProfile({ ...sampleLoan, extra: 'ignored' });

    expect(parsed).not.toHaveProperty('extra');
  });

  test.each([
    ['not an object', null],
    ['wrong schema', { ...sampleLoan, schema: 2 }],
    ['missing meta', { ...sampleLoan, meta: undefined }],
    ['text principal', { ...sampleLoan, loan: { ...sampleLoan.loan, principal: '45L' } }],
    ['bad date', { ...sampleLoan, loan: { ...sampleLoan.loan, startDate: '2023-02-30' } }],
    [
      'negative payment',
      {
        ...sampleLoan,
        loan: { ...sampleLoan.loan, partPayments: [{ date: '2024-01-05', amount: -1 }] },
      },
    ],
    [
      'event before start',
      {
        ...sampleLoan,
        loan: { ...sampleLoan.loan, rateChanges: [{ date: '2020-01-01', rate: 8 }] },
      },
    ],
    ['scenarios missing', { ...sampleLoan, scenarios: undefined }],
  ])('rejects %s', (_name, input) => {
    expect(() => parseLoanProfile(input)).toThrow(LoanProfileError);
  });
});
