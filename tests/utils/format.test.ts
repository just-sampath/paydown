import { describe, expect, test } from 'vitest';

import {
  durationWords,
  formatDate,
  formatDuration,
  formatMonthYear,
  pluralize,
} from '../../src/utils/format';
import { interestShift, lengthShift, timeShift } from '../../src/utils/savings';

describe('formatting', () => {
  test('keeps one sign on a negative duration instead of one per unit', () => {
    expect(formatDuration(62)).toBe('5 yr 2 mo');
    expect(formatDuration(-116)).toBe('-9 yr 8 mo');
    expect(formatDuration(0)).toBe('0 mo');
  });

  test('spells out a duration in parts that each keep their unit', () => {
    expect(durationWords(135)).toEqual(['11 years', '3 months']);
    expect(durationWords(12)).toEqual(['1 year']);
    expect(durationWords(1)).toEqual(['1 month']);
    expect(durationWords(0)).toEqual(['0 months']);
  });

  test('uses three-letter months, including September', () => {
    expect(formatMonthYear('2026-09-01')).toBe('Sep 2026');
    expect(formatDate('2026-09-07')).toBe('7 Sep 2026');
  });

  test('counts in the right number', () => {
    expect(pluralize(1, 'rate')).toBe('1 rate');
    expect(pluralize(3, 'part payment')).toBe('3 part payments');
  });

  test('describes savings and losses in words, never with a minus sign', () => {
    expect(timeShift(62)).toBe('5 yr 2 mo sooner');
    expect(timeShift(-3)).toBe('3 mo later');
    expect(lengthShift(-15)).toBe('1 yr 3 mo longer');
    expect(interestShift(2_100_000)).toBe('₹21L less interest');
    expect(interestShift(-153_000, '')).toBe('₹1.53L more');
  });
});
