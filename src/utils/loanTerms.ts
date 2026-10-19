import { parseLoanProfile, type LoanProfile } from '../features/vault/loanProfile';
import { formatDate, formatInr } from './format';
import { RATE_HINT, RATE_LIMITS } from './rates';

/** Smallest and largest amount borrowed a field accepts. Outside this is a typo. */
export const AMOUNT_LIMITS = { min: 10_000, max: 1_000_000_000 } as const;
/** 1 EMI to 40 years of EMIs. */
export const TENURE_LIMITS = { min: 1, max: 480 } as const;
export const NAME_MAX_LENGTH = 60;

export const AMOUNT_TERM_HINT = `Use an amount from ${formatInr(AMOUNT_LIMITS.min)} to ${formatInr(AMOUNT_LIMITS.max)}.`;
export const TENURE_HINT = `Use ${TENURE_LIMITS.min} to ${TENURE_LIMITS.max} EMIs (up to 40 years).`;
export const PRE_EMI_HINT = 'Use ₹0 or more.';
export const NAME_HINT = `Use 1 to ${NAME_MAX_LENGTH} characters.`;
export { RATE_HINT, RATE_LIMITS };

/** The loan's own terms, without its events. */
export type LoanTerms = {
  name: string;
  lender: string;
  principal: number;
  originalRate: number;
  tenureMonths: number;
  startDate: string;
  preEmiInterest: number;
};

/**
 * Finds the earliest dated event in the loan and in every scenario. The first EMI can't
 * come after it, because the schedule can't place an event before the loan starts.
 *
 * @param profile - Loan profile.
 * @returns The earliest event date, or `undefined` when there are no events.
 */
export function earliestEventDate(profile: LoanProfile): string | undefined {
  const dates = [
    ...profile.loan.rateChanges,
    ...profile.loan.partPayments,
    ...profile.scenarios.flatMap((scenario) => [...scenario.rateChanges, ...scenario.partPayments]),
  ].map((event) => event.date);

  return dates.length === 0 ? undefined : dates.reduce((a, b) => (b < a ? b : a));
}

/**
 * Says why a first EMI date can't be used.
 *
 * @param profile - Loan profile whose events must stay on or after the date.
 * @returns A hint, or `undefined` when any date works.
 */
export function startDateHint(profile: LoanProfile): string | undefined {
  const earliest = earliestEventDate(profile);
  return earliest === undefined
    ? undefined
    : `The first EMI must be on or before ${formatDate(earliest)}, the first rate change or part payment.`;
}

/**
 * Checks one free-text term such as the loan's name or lender.
 *
 * @param text - Typed text.
 * @returns The trimmed text, or `undefined` when it is empty or too long.
 */
export function cleanName(text: string): string | undefined {
  const trimmed = text.trim();
  return trimmed.length === 0 || Array.from(trimmed).length > NAME_MAX_LENGTH ? undefined : trimmed;
}

/**
 * Puts new terms onto a profile and checks the result as a whole.
 *
 * @param profile - Current profile, whose events and scenarios are kept.
 * @param terms - New terms.
 * @returns The new profile, or `undefined` when the terms are out of range or the loan
 * wouldn't work with its events.
 */
export function withTerms(profile: LoanProfile, terms: LoanTerms): LoanProfile | undefined {
  const name = cleanName(terms.name);
  const lender = cleanName(terms.lender);
  const earliest = earliestEventDate(profile);

  if (
    name === undefined ||
    lender === undefined ||
    !inRange(terms.principal, AMOUNT_LIMITS) ||
    !inRange(terms.originalRate, RATE_LIMITS) ||
    !Number.isInteger(terms.tenureMonths) ||
    !inRange(terms.tenureMonths, TENURE_LIMITS) ||
    !(terms.preEmiInterest >= 0) ||
    (earliest !== undefined && terms.startDate > earliest)
  ) {
    return undefined;
  }

  try {
    return parseLoanProfile({
      ...profile,
      meta: { ...profile.meta, name, lender },
      loan: {
        rateChanges: profile.loan.rateChanges,
        partPayments: profile.loan.partPayments,
        principal: terms.principal,
        originalRate: terms.originalRate,
        tenureMonths: terms.tenureMonths,
        startDate: terms.startDate,
        ...(terms.preEmiInterest > 0 ? { preEmiInterest: terms.preEmiInterest } : {}),
      },
    });
  } catch {
    return undefined;
  }
}

/**
 * Reads the terms out of a profile.
 *
 * @param profile - Loan profile.
 * @returns Its terms.
 */
export function termsOf(profile: LoanProfile): LoanTerms {
  return {
    name: profile.meta.name,
    lender: profile.meta.lender,
    principal: profile.loan.principal,
    originalRate: profile.loan.originalRate,
    tenureMonths: profile.loan.tenureMonths,
    startDate: profile.loan.startDate,
    preEmiInterest: profile.loan.preEmiInterest ?? 0,
  };
}

function inRange(value: number, limits: { min: number; max: number }): boolean {
  return Number.isFinite(value) && value >= limits.min && value <= limits.max;
}
