import { describe, expect, test } from 'vitest';

import { sampleLoan } from '../../src/config/sampleLoan';
import {
  addPayment,
  addRate,
  CommandError,
  countProfile,
  parseDateFlag,
  parseNonNegativeNumber,
  parsePositiveNumber,
  removePayment,
  removeRate,
} from '../../scripts/vault/commands';

describe('vault CLI commands', () => {
  test('adds a part payment in date order without mutating the input', () => {
    const before = JSON.stringify(sampleLoan);
    const updated = addPayment(sampleLoan, { date: '2024-06-17', amount: 90_000 });

    expect(updated.loan.partPayments.map((item) => item.date)).toEqual([
      '2024-02-14',
      '2024-06-17',
      '2024-10-09',
      '2025-08-12',
    ]);
    expect(JSON.stringify(sampleLoan)).toBe(before);
  });

  test('rejects duplicate and invalid part payments', () => {
    expect(() => addPayment(sampleLoan, { date: '2024-02-14', amount: 125_000 })).toThrow(
      CommandError,
    );
    expect(() => addPayment(sampleLoan, { date: '2024-02-30', amount: 1_000 })).toThrow(
      CommandError,
    );
    expect(() => addPayment(sampleLoan, { date: '2020-01-10', amount: 1_000 })).toThrow(
      CommandError,
    );
  });

  test('removes a part payment, requiring an amount when the date is ambiguous', () => {
    const doubled = addPayment(sampleLoan, { date: '2024-02-14', amount: 10_000 });

    expect(() => removePayment(doubled, { date: '2024-02-14' })).toThrow(/--amount/);
    expect(
      removePayment(doubled, { date: '2024-02-14', amount: 10_000 }).loan.partPayments,
    ).toEqual(sampleLoan.loan.partPayments);
    expect(() => removePayment(sampleLoan, { date: '2024-03-01' })).toThrow(CommandError);
  });

  test('adds and removes rate changes, one per date', () => {
    const updated = addRate(sampleLoan, { date: '2026-02-01', rate: 8.1 });

    expect(updated.loan.rateChanges.at(-1)).toEqual({ date: '2026-02-01', rate: 8.1 });
    expect(() => addRate(updated, { date: '2026-02-01', rate: 8 })).toThrow(CommandError);
    expect(removeRate(updated, { date: '2026-02-01' }).loan.rateChanges).toEqual(
      sampleLoan.loan.rateChanges,
    );
    expect(() => removeRate(sampleLoan, { date: '2026-02-01' })).toThrow(CommandError);
  });

  test('parses flags strictly', () => {
    expect(parsePositiveNumber('1,25,000', 'amount')).toBe(125_000);
    expect(parsePositiveNumber('125_000', 'amount')).toBe(125_000);
    expect(parseNonNegativeNumber('0', 'rate')).toBe(0);
    expect(() => parsePositiveNumber('0', 'amount')).toThrow(CommandError);
    expect(() => parsePositiveNumber('abc', 'amount')).toThrow(CommandError);
    expect(() => parsePositiveNumber(undefined, 'amount')).toThrow(CommandError);
    expect(parseDateFlag('2026-01-31')).toBe('2026-01-31');
    expect(() => parseDateFlag('31-01-2026')).toThrow(CommandError);
  });

  test('summarizes counts without any figures', () => {
    expect(countProfile(sampleLoan)).toBe('3 rate changes, 3 part payments, 0 scenarios');
  });
});
