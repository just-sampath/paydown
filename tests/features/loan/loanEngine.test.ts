import { describe, expect, test } from 'vitest';

import { sampleLoan } from '../../../src/config/sampleLoan';
import {
  buildLoanAnalysis,
  calculateEmi,
  createSchedule,
  getEffectiveMonthIndex,
  type LoanConfig,
} from '../../../src/features/loan/loanEngine';

const defaultConfig: LoanConfig = sampleLoan.loan;

const baseConfig: LoanConfig = {
  principal: defaultConfig.principal,
  originalRate: defaultConfig.originalRate,
  tenureMonths: defaultConfig.tenureMonths,
  startDate: defaultConfig.startDate,
  rateChanges: [],
  partPayments: [],
};

const asOfDate = '2026-08-15';

describe('loan engine', () => {
  test('counts every remaining payment after the as-of date', () => {
    const withoutLastPrepayment = buildLoanAnalysis(
      { ...defaultConfig, partPayments: defaultConfig.partPayments.slice(0, -1) },
      asOfDate,
    );
    const analysis = buildLoanAnalysis(defaultConfig, asOfDate);

    expect(analysis.remainingPaymentCount).toBe(137);
    expect(withoutLastPrepayment.remainingPaymentCount).toBeGreaterThan(137);
  });

  test('charges simple interest from the day after the EMI to the day before the prepayment', () => {
    const analysis = buildLoanAnalysis(defaultConfig, asOfDate);

    // 1,25,000 × 8.95% × 12 days (2..13 Feb) / 366 (leap year) = 366.80
    expect(analysis.partPaymentImpacts[0]?.simpleInterest ?? 0).toBeCloseTo(366.8, 1);
    // 2,40,000 × 8.35% × 10 days / 365 = 549.04
    expect(analysis.partPaymentImpacts[2]?.simpleInterest ?? 0).toBeCloseTo(549.04, 1);
  });

  test('calculates a clean 15-year reducing-balance amortization schedule to the rupee', () => {
    const schedule = createSchedule(baseConfig);

    expect(Math.round(calculateEmi(4_500_000, 9.15, 240))).toBe(40_923);
    expect(Math.round(calculateEmi(1_000_000, 7.2, 120))).toBe(11_714);
    expect(schedule.summary.totalMonths).toBe(240);
    expect(Math.round(schedule.summary.baseEmi)).toBe(40_923);
    expect(Math.round(schedule.summary.totalInterest)).toBe(5_321_472);
    // 45,00,000 × 9.15% / 12 = 34,312.50
    expect(Math.round(schedule.rows[0]?.interest ?? 0)).toBe(34_313);
    expect(Math.round(schedule.rows[0]?.principal ?? 0)).toBe(6_610);
    expect(Math.round(schedule.rows[0]?.openingBalance ?? 0)).toBe(4_500_000);
    expect(Math.round(schedule.rows[0]?.closingBalance ?? 0)).toBe(4_493_390);
    expect(Math.round(schedule.rows.at(-1)?.closingBalance ?? -1)).toBe(0);
    expect(schedule.rows[0]?.date).toBe('2023-04-01');
    expect(schedule.rows[1]?.date).toBe('2023-05-01');
  });

  test('applies a rate drop from the effective month while keeping the original EMI', () => {
    const schedule = createSchedule({
      ...baseConfig,
      rateChanges: [{ date: '2023-10-01', rate: 8.4 }],
    });

    const september = schedule.rows[5];
    const october = schedule.rows[6];

    expect(september?.rate).toBe(9.15);
    expect(october?.rate).toBe(8.4);
    expect(Math.round(october?.emi ?? 0)).toBe(40_923);
    expect(Math.round(october?.interest ?? 0)).toBe(31_217);
    expect(schedule.summary.totalMonths).toBeLessThan(240);
    expect(schedule.summary.totalInterest).toBeLessThan(
      createSchedule(baseConfig).summary.totalInterest,
    );
  });

  test('charges simple interest on a mid-month prepayment and reduces the closing balance', () => {
    const withoutPrepayment = createSchedule(baseConfig);
    const withPrepayment = createSchedule({
      ...baseConfig,
      partPayments: [{ date: '2023-10-08', amount: 300_000 }],
    });

    const octoberWithoutPrepayment = withoutPrepayment.rows[6];
    const octoberWithPrepayment = withPrepayment.rows[6];

    expect(octoberWithPrepayment?.prepayment).toBe(300_000);
    // Interest is computed on the full opening balance (EMI on the 1st, before the prepayment).
    expect(Math.round(octoberWithPrepayment?.interest ?? 0)).toBe(
      Math.round(octoberWithoutPrepayment?.interest ?? 0),
    );
    // Simple interest on the prepaid amount for days 2..7 at 9.15%: 3,00,000 × 9.15% × 6 / 365.
    expect(octoberWithPrepayment?.simpleInterest ?? 0).toBeCloseTo(451.23, 1);
    // The prepayment reduces the closing balance, not the current month's interest.
    expect(Math.round(octoberWithPrepayment?.closingBalance ?? 0)).toBe(4_152_656);
    expect(Math.round(octoberWithPrepayment?.closingBalance ?? 0)).toBeLessThan(
      Math.round(octoberWithoutPrepayment?.closingBalance ?? 0),
    );
    expect(Math.round(octoberWithPrepayment?.emi ?? 0)).toBe(40_923);
    expect(withPrepayment.summary.totalMonths).toBeLessThan(withoutPrepayment.summary.totalMonths);
  });

  test('computes current state from completed EMI dates and counts every future payment', () => {
    const analysis = buildLoanAnalysis(defaultConfig, asOfDate);
    const rateMonths = analysis.rateImpacts.reduce((sum, item) => sum + item.monthsSaved, 0);
    const prepaymentMonths = analysis.partPaymentImpacts.reduce(
      (sum, item) => sum + item.monthsSaved,
      0,
    );

    expect(analysis.original.summary.totalMonths).toBe(240);
    expect(analysis.actual.summary.totalMonths).toBe(178);
    expect(analysis.monthsSaved).toBe(rateMonths + prepaymentMonths);
    expect(analysis.monthsSaved).toBe(62);
    expect(Math.round(analysis.actual.summary.totalPrepayment)).toBe(440_000);
    expect(Math.round(analysis.actual.summary.totalSimpleInterest)).toBe(1_040);
    expect(analysis.actual.summary.preEmiInterest).toBe(11_200);
    expect(Math.round(analysis.actual.summary.totalInterest)).toBe(3_233_157);
    expect(Math.round(analysis.interestSaved)).toBe(2_099_514);
    expect(Math.round(analysis.outstanding)).toBe(3_605_336);
    expect(Math.round(analysis.actual.summary.totalOutflow)).toBe(7_733_157);
    expect(Math.round(analysis.actual.rows.at(-1)?.emi ?? 0)).toBe(37_582);
    expect(analysis.nextRow?.date).toBe('2026-09-01');
    expect(analysis.remainingPaymentCount).toBe(137);
    expect(Math.round(analysis.remainingScheduledPayments)).toBe(5_603_083);
    expect(Math.round(analysis.remainingInterest)).toBe(1_997_747);
    expect(analysis.rateImpacts.map((impact) => impact.monthsSaved)).toEqual([8, 8, 6]);
    expect(analysis.partPaymentImpacts.map((impact) => impact.monthsSaved)).toEqual([15, 7, 18]);
  });

  test('compares rate changes against the same plan with prepayments retained', () => {
    const analysis = buildLoanAnalysis(defaultConfig, asOfDate);

    expect(analysis.rateCategoryImpact.monthsSaved).toBe(15);
    expect(Math.round(analysis.rateCategoryImpact.interestSaved)).toBe(615_134);
    expect(analysis.partPaymentCategoryImpact.monthsSaved).toBe(36);
    expect(Math.round(analysis.partPaymentCategoryImpact.interestSaved)).toBe(1_032_912);
  });

  test('exposes regular, simple, and pre-EMI interest separately', () => {
    const analysis = buildLoanAnalysis(defaultConfig, asOfDate);

    expect(Math.round(analysis.actual.summary.scheduledInterest)).toBe(3_220_917);
    expect(Math.round(analysis.actual.summary.totalSimpleInterest)).toBe(1_040);
    expect(analysis.actual.summary.preEmiInterest).toBe(11_200);
    expect(Math.round(analysis.partPaymentImpacts[0]?.simpleInterest ?? 0)).toBe(367);
  });

  test('normalizes mid-month rate changes to the next month and first-day changes to the same month', () => {
    expect(getEffectiveMonthIndex('2023-10-01', baseConfig.startDate, 'rate')).toBe(7);
    expect(getEffectiveMonthIndex('2023-10-02', baseConfig.startDate, 'rate')).toBe(8);
    expect(getEffectiveMonthIndex('2023-10-31', baseConfig.startDate, 'rate')).toBe(8);
  });

  test('applies a prepayment on the EMI date with no simple interest and reduces the closing balance', () => {
    const schedule = createSchedule({
      ...baseConfig,
      partPayments: [{ date: '2023-04-01', amount: 100_000 }],
    });

    const firstRow = schedule.rows[0];

    expect(firstRow?.prepayment).toBe(100_000);
    expect(Math.round(firstRow?.openingBalance ?? 0)).toBe(4_500_000);
    expect(Math.round(firstRow?.interest ?? 0)).toBe(34_313);
    expect(firstRow?.simpleInterest ?? 0).toBe(0);
    expect(Math.round(firstRow?.closingBalance ?? 0)).toBe(4_393_390);
  });

  test('allows a final EMI smaller than the regular EMI', () => {
    const schedule = createSchedule({
      ...baseConfig,
      partPayments: [{ date: '2023-04-01', amount: 4_490_000 }],
    });

    expect(schedule.summary.totalMonths).toBe(2);
    expect(Math.round(schedule.rows.at(-1)?.emi ?? 0)).toBeLessThan(
      Math.round(schedule.summary.baseEmi),
    );
    expect(Math.round(schedule.rows.at(-1)?.closingBalance ?? -1)).toBe(0);
  });
});
