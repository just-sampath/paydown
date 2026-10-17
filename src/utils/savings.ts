import { formatDuration, formatInrShort } from './format';

/**
 * Describes a change in loan length in words, never with a minus sign.
 *
 * @param monthsSaved - Months taken off the loan; negative when months were added.
 * @returns Phrase such as `5 yr 2 mo sooner`, `3 mo later`, or `no change`.
 */
export function timeShift(monthsSaved: number): string {
  if (monthsSaved === 0) {
    return 'no change';
  }

  return `${formatDuration(Math.abs(monthsSaved))} ${monthsSaved > 0 ? 'sooner' : 'later'}`;
}

/**
 * Describes a change in loan length as shorter or longer.
 *
 * @param monthsSaved - Months taken off the loan; negative when months were added.
 * @returns Phrase such as `1 yr 3 mo shorter` or `no change`.
 */
export function lengthShift(monthsSaved: number): string {
  if (monthsSaved === 0) {
    return 'no change';
  }

  return `${formatDuration(Math.abs(monthsSaved))} ${monthsSaved > 0 ? 'shorter' : 'longer'}`;
}

/**
 * Describes a change in interest as less or more, never with a minus sign.
 *
 * @param interestSaved - Rupees of interest avoided; negative when interest was added.
 * @param noun - Text after "less" or "more"; pass `''` inside a column already titled interest.
 * @returns Phrase such as `₹21L less interest` or `₹1.5L more interest`.
 */
export function interestShift(interestSaved: number, noun = ' interest'): string {
  if (Math.round(interestSaved) === 0) {
    return noun === '' ? 'no change' : 'same interest';
  }

  return `${formatInrShort(Math.abs(interestSaved))} ${interestSaved > 0 ? 'less' : 'more'}${noun}`;
}
