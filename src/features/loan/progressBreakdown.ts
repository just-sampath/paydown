import type { LoanAnalysis } from './loanEngine';

export type ProgressSegmentKey =
  | 'emi'
  | 'part-payments'
  | 'extra-interest'
  | 'emi-principal'
  | 'emi-interest'
  | 'simple-interest'
  | 'pre-emi';

export type ProgressSegment = {
  key: ProgressSegmentKey;
  label: string;
  amount: number;
};

export type ProgressMeter = {
  filled: number;
  remaining: number;
  total: number;
  segments: ProgressSegment[];
};

export type PrepaidProgress = ProgressMeter & {
  interestSaved: number;
  monthsSaved: number;
};

export type PaidProgress = {
  cash: ProgressMeter;
  principal: ProgressMeter;
  interest: ProgressMeter;
  prepaid: PrepaidProgress;
};

/**
 * Builds paid-to-date progress meters from an existing loan analysis.
 *
 * This is display aggregation only. It does not change EMI, tenure, rate, or
 * savings formulas. Rate changes are excluded from paid slices because they are
 * not cash outflows.
 *
 * @param analysis - Dashboard loan analysis for the current as-of date.
 * @returns Cash, principal, interest, and prepaid progress meters.
 */
export function buildPaidProgress(analysis: LoanAnalysis): PaidProgress {
  const completed = analysis.completedRows;
  const emiPaid = sumBy(completed, (row) => row.emi);
  const prepaid = sumBy(completed, (row) => row.prepayment);
  const emiPrincipal = sumBy(completed, (row) => row.principal);
  const emiInterest = sumBy(completed, (row) => row.interest);
  const simpleInterest = sumBy(completed, (row) => row.simpleInterest);
  const preEmiInterest = analysis.actual.summary.preEmiInterest;
  const extraInterest = simpleInterest + preEmiInterest;
  const cashFilled = emiPaid + prepaid + extraInterest;

  return {
    cash: {
      filled: cashFilled,
      remaining: analysis.remainingScheduledPayments,
      total: analysis.actual.summary.totalOutflow,
      segments: [
        { key: 'emi', label: 'EMIs', amount: emiPaid },
        { key: 'part-payments', label: 'Part payments', amount: prepaid },
        { key: 'extra-interest', label: 'Extra interest charges', amount: extraInterest },
      ],
    },
    principal: {
      filled: analysis.paidPrincipal,
      remaining: analysis.outstanding,
      total: analysis.actual.summary.totalPrincipal,
      segments: [
        { key: 'emi-principal', label: 'EMI principal', amount: emiPrincipal },
        { key: 'part-payments', label: 'Part payments', amount: prepaid },
      ],
    },
    interest: {
      filled: emiInterest + extraInterest,
      remaining: analysis.remainingInterest,
      total: analysis.actual.summary.totalInterest,
      segments: [
        { key: 'emi-interest', label: 'EMI interest', amount: emiInterest },
        { key: 'simple-interest', label: 'Simple interest on prepays', amount: simpleInterest },
        { key: 'pre-emi', label: 'Pre-EMI interest', amount: preEmiInterest },
      ],
    },
    prepaid: {
      filled: prepaid,
      remaining: 0,
      total: prepaid,
      interestSaved: analysis.partPaymentCategoryImpact.interestSaved,
      monthsSaved: analysis.partPaymentCategoryImpact.monthsSaved,
      segments: [{ key: 'part-payments', label: 'Part payments', amount: prepaid }],
    },
  };
}

function sumBy<T>(items: T[], readValue: (item: T) => number): number {
  return items.reduce((sum, item) => sum + readValue(item), 0);
}
