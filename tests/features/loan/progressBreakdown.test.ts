import { describe, expect, test } from 'vitest';

import { sampleLoan } from '../../../src/config/sampleLoan';
import { buildLoanAnalysis } from '../../../src/features/loan/loanEngine';
import { buildPaidProgress } from '../../../src/features/loan/progressBreakdown';

const asOfDate = '2026-08-15';

describe('paid progress breakdown', () => {
  test('splits cash paid into EMIs, part payments, and extra interest charges', () => {
    const analysis = buildLoanAnalysis(sampleLoan.loan, asOfDate);
    const progress = buildPaidProgress(analysis);
    const completed = analysis.completedRows;
    const emiPaid = sumBy(completed, (row) => row.emi);
    const prepaid = sumBy(completed, (row) => row.prepayment);
    const extraInterest =
      sumBy(completed, (row) => row.simpleInterest) + analysis.actual.summary.preEmiInterest;

    expect(progress.cash.segments.map((segment) => segment.key)).toEqual([
      'emi',
      'part-payments',
      'extra-interest',
    ]);
    expect(progress.cash.segments.some((segment) => segment.key.includes('rate'))).toBe(false);
    expect(amountFor(progress.cash, 'emi')).toBeCloseTo(emiPaid);
    expect(amountFor(progress.cash, 'part-payments')).toBeCloseTo(prepaid);
    expect(amountFor(progress.cash, 'extra-interest')).toBeCloseTo(extraInterest);
    expect(progress.cash.filled).toBeCloseTo(emiPaid + prepaid + extraInterest);
    expect(progress.cash.remaining).toBeCloseTo(analysis.remainingScheduledPayments);
    expect(progress.cash.filled + progress.cash.remaining).toBeCloseTo(
      analysis.actual.summary.totalOutflow,
    );
  });

  test('splits principal paid into EMI principal and part payments only', () => {
    const analysis = buildLoanAnalysis(sampleLoan.loan, asOfDate);
    const progress = buildPaidProgress(analysis);
    const emiPrincipal = sumBy(analysis.completedRows, (row) => row.principal);
    const prepaid = sumBy(analysis.completedRows, (row) => row.prepayment);

    expect(progress.principal.segments.map((segment) => segment.key)).toEqual([
      'emi-principal',
      'part-payments',
    ]);
    expect(progress.principal.segments.some((segment) => segment.key.includes('rate'))).toBe(false);
    expect(amountFor(progress.principal, 'emi-principal')).toBeCloseTo(emiPrincipal);
    expect(amountFor(progress.principal, 'part-payments')).toBeCloseTo(prepaid);
    expect(progress.principal.filled).toBeCloseTo(analysis.paidPrincipal);
    expect(progress.principal.remaining).toBeCloseTo(analysis.outstanding);
    expect(progress.principal.total).toBeCloseTo(analysis.actual.summary.totalPrincipal);
  });

  test('splits interest paid into EMI interest, simple interest, and pre-EMI', () => {
    const analysis = buildLoanAnalysis(sampleLoan.loan, asOfDate);
    const progress = buildPaidProgress(analysis);
    const emiInterest = sumBy(analysis.completedRows, (row) => row.interest);
    const simpleInterest = sumBy(analysis.completedRows, (row) => row.simpleInterest);
    const preEmiInterest = analysis.actual.summary.preEmiInterest;

    expect(progress.interest.segments.map((segment) => segment.key)).toEqual([
      'emi-interest',
      'simple-interest',
      'pre-emi',
    ]);
    expect(progress.interest.segments.some((segment) => segment.key.includes('rate'))).toBe(false);
    expect(amountFor(progress.interest, 'emi-interest')).toBeCloseTo(emiInterest);
    expect(amountFor(progress.interest, 'simple-interest')).toBeCloseTo(simpleInterest);
    expect(amountFor(progress.interest, 'pre-emi')).toBeCloseTo(preEmiInterest);
    expect(progress.interest.filled).toBeCloseTo(emiInterest + simpleInterest + preEmiInterest);
    expect(progress.interest.remaining).toBeCloseTo(analysis.remainingInterest);
    expect(progress.interest.total).toBeCloseTo(analysis.actual.summary.totalInterest);
  });

  test('reports prepaid cash against lifetime prepayment interest savings', () => {
    const analysis = buildLoanAnalysis(sampleLoan.loan, asOfDate);
    const progress = buildPaidProgress(analysis);
    const prepaid = sumBy(analysis.completedRows, (row) => row.prepayment);

    expect(progress.prepaid.filled).toBeCloseTo(prepaid);
    expect(progress.prepaid.filled).toBeCloseTo(analysis.paidPrepayment);
    expect(progress.prepaid.interestSaved).toBeCloseTo(
      analysis.partPaymentCategoryImpact.interestSaved,
    );
    expect(progress.prepaid.monthsSaved).toBe(analysis.partPaymentCategoryImpact.monthsSaved);
    expect(progress.prepaid.segments.map((segment) => segment.key)).toEqual(['part-payments']);
  });
});

function amountFor(
  meter: { segments: Array<{ key: string; amount: number }> },
  key: string,
): number {
  return meter.segments.find((segment) => segment.key === key)?.amount ?? Number.NaN;
}

function sumBy<T>(items: T[], readValue: (item: T) => number): number {
  return items.reduce((sum, item) => sum + readValue(item), 0);
}
