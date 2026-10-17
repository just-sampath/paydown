import type { RateChange } from '../features/loan/loanEngine';
import { formatPercent } from './format';

/** Lowest and highest rate a field accepts. Anything outside is a typo, not a home loan. */
export const RATE_LIMITS = { min: 1, max: 30 } as const;

/** Shown under a rate field when the typed value is outside {@link RATE_LIMITS}. */
export const RATE_HINT = `Use a rate from ${RATE_LIMITS.min}% to ${RATE_LIMITS.max}%.`;

/**
 * Finds the rate that applies on a date, from the starting rate and the dated changes.
 *
 * @param date - ISO date to look up.
 * @param startRate - Rate before any change.
 * @param changes - Rate changes in any order.
 * @returns The rate of the latest change on or before `date`, or `startRate`.
 */
export function rateOn(date: string, startRate: number, changes: RateChange[]): number {
  return changes
    .filter((change) => change.date <= date)
    .sort((left, right) => left.date.localeCompare(right.date))
    .reduce((rate, change) => change.rate, startRate);
}

/**
 * Explains why a new rate change would do nothing, so the form can refuse it.
 *
 * @param date - ISO date of the new change.
 * @param rate - New rate.
 * @param startRate - Rate before any change.
 * @param changes - Changes that already exist.
 * @returns A sentence for the user, or `undefined` when the change is worth adding.
 */
export function rateConflict(
  date: string,
  rate: number,
  startRate: number,
  changes: RateChange[],
): string | undefined {
  if (changes.some((change) => change.date === date)) {
    return 'There is already a rate change on that date. Edit it in the list instead.';
  }

  if (Math.abs(rateOn(date, startRate, changes) - rate) < 0.001) {
    return `The rate is already ${formatPercent(rate)} on that date.`;
  }

  return undefined;
}
