import { describe, expect, test } from 'vitest';

import { pageFromHash } from '../../src/app/navigation';

describe('hash navigation', () => {
  test('parses known pages and rejects unknown hashes', () => {
    expect(pageFromHash('#schedule')).toBe('schedule');
    expect(pageFromHash('#whatif')).toBe('whatif');
    expect(pageFromHash('#unknown')).toBe('dashboard');
    expect(pageFromHash('')).toBe('dashboard');
  });
});
