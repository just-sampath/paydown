import { parseLoanProfile, type LoanProfile } from '../../src/features/vault/loanProfile';

/**
 * Pure edits applied by the vault CLI. Each returns a new, re-validated profile and
 * never mutates its input, so a failed edit leaves the original untouched.
 */

export type PaymentInput = { date: string; amount: number };
export type RateInput = { date: string; rate: number };

export class CommandError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CommandError';
  }
}

/**
 * Adds a part payment.
 *
 * @param profile - Current profile.
 * @param payment - Part payment to add.
 * @returns Updated profile with payments sorted by date.
 */
export function addPayment(profile: LoanProfile, payment: PaymentInput): LoanProfile {
  const exists = profile.loan.partPayments.some(
    (item) => item.date === payment.date && item.amount === payment.amount,
  );

  if (exists) {
    throw new CommandError(`A part payment of that amount on ${payment.date} already exists.`);
  }

  return withLoan(profile, {
    partPayments: sortByDate([...profile.loan.partPayments, { ...payment }]),
  });
}

/**
 * Removes a part payment by date, and by amount when several share the date.
 *
 * @param profile - Current profile.
 * @param match - Date, plus amount to disambiguate.
 * @returns Updated profile.
 */
export function removePayment(
  profile: LoanProfile,
  match: { date: string; amount?: number },
): LoanProfile {
  const matches = profile.loan.partPayments.filter(
    (item) =>
      item.date === match.date && (match.amount === undefined || item.amount === match.amount),
  );

  if (matches.length === 0) {
    throw new CommandError(`No part payment matches ${match.date}.`);
  }

  if (matches.length > 1) {
    throw new CommandError(`Several part payments on ${match.date}; pass --amount to pick one.`);
  }

  const target = matches[0];
  return withLoan(profile, {
    partPayments: profile.loan.partPayments.filter((item) => item !== target),
  });
}

/**
 * Adds a rate change. Only one rate change per date is allowed.
 *
 * @param profile - Current profile.
 * @param rate - Rate change to add.
 * @returns Updated profile with rate changes sorted by date.
 */
export function addRate(profile: LoanProfile, rate: RateInput): LoanProfile {
  if (profile.loan.rateChanges.some((item) => item.date === rate.date)) {
    throw new CommandError(`A rate change on ${rate.date} already exists; remove it first.`);
  }

  return withLoan(profile, {
    rateChanges: sortByDate([...profile.loan.rateChanges, { ...rate }]),
  });
}

/**
 * Removes the rate change on a date.
 *
 * @param profile - Current profile.
 * @param match - Date of the rate change.
 * @returns Updated profile.
 */
export function removeRate(profile: LoanProfile, match: { date: string }): LoanProfile {
  if (!profile.loan.rateChanges.some((item) => item.date === match.date)) {
    throw new CommandError(`No rate change on ${match.date}.`);
  }

  return withLoan(profile, {
    rateChanges: profile.loan.rateChanges.filter((item) => item.date !== match.date),
  });
}

/**
 * Lists events as terminal lines, for the owner's eyes only.
 *
 * @param profile - Profile to describe.
 * @returns Lines of text.
 */
export function describeProfile(profile: LoanProfile): string[] {
  const { loan } = profile;
  return [
    `${profile.meta.name} (${profile.meta.lender})`,
    `principal ${loan.principal} · rate ${loan.originalRate}% · ${loan.tenureMonths} months from ${loan.startDate}`,
    `rate changes (${loan.rateChanges.length}):`,
    ...loan.rateChanges.map((item) => `  ${item.date}  ${item.rate}%`),
    `part payments (${loan.partPayments.length}):`,
    ...loan.partPayments.map((item) => `  ${item.date}  ${item.amount}`),
    `scenarios: ${profile.scenarios.length}`,
  ];
}

/**
 * Summarizes a profile without any figures.
 *
 * @param profile - Profile to count.
 * @returns One line of counts.
 */
export function countProfile(profile: LoanProfile): string {
  return `${profile.loan.rateChanges.length} rate changes, ${profile.loan.partPayments.length} part payments, ${profile.scenarios.length} scenarios`;
}

/**
 * Parses a strictly positive number from a CLI flag.
 *
 * @param value - Raw flag value.
 * @param name - Flag name for errors.
 * @returns The number.
 */
export function parsePositiveNumber(value: string | undefined, name: string): number {
  const number = parseNonNegativeNumber(value, name);

  if (number === 0) {
    throw new CommandError(`--${name} must be greater than 0.`);
  }

  return number;
}

/**
 * Parses a non-negative number from a CLI flag. Accepts `_` and `,` separators.
 *
 * @param value - Raw flag value.
 * @param name - Flag name for errors.
 * @returns The number.
 */
export function parseNonNegativeNumber(value: string | undefined, name: string): number {
  const cleaned = value?.replace(/[_,]/g, '') ?? '';
  const number = Number(cleaned);

  if (cleaned === '' || !Number.isFinite(number) || number < 0) {
    throw new CommandError(`--${name} must be a non-negative number.`);
  }

  return number;
}

/**
 * Requires a `YYYY-MM-DD` flag value. Calendar validity is checked by the profile validator.
 *
 * @param value - Raw flag value.
 * @returns The date string.
 */
export function parseDateFlag(value: string | undefined): string {
  if (value === undefined || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new CommandError('--date must look like YYYY-MM-DD.');
  }

  return value;
}

function withLoan(profile: LoanProfile, patch: Partial<LoanProfile['loan']>): LoanProfile {
  try {
    return parseLoanProfile({ ...profile, loan: { ...profile.loan, ...patch } });
  } catch (error) {
    throw new CommandError((error as Error).message);
  }
}

function sortByDate<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.date.localeCompare(right.date));
}
