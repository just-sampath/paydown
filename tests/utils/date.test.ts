import { describe, expect, test } from 'vitest';

import { toLocalIsoDate } from '../../src/utils/date';

describe('local date formatting', () => {
  test('returns a timezone-safe local ISO date', () => {
    expect(toLocalIsoDate(new Date(2026, 7, 15, 23, 45))).toBe('2026-08-15');
  });
});
