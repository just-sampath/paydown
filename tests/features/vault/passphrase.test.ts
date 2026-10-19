import { describe, expect, test } from 'vitest';

import {
  MIN_PASSPHRASE_LENGTH,
  passphraseProblem,
  suggestPassphrase,
} from '../../../src/features/vault/passphrase';

describe('passphrase policy', () => {
  test('refuses short passphrases and stray spaces', () => {
    expect(MIN_PASSPHRASE_LENGTH).toBe(20);
    expect(passphraseProblem('short one')).toContain('at least 20 characters');
    expect(passphraseProblem(' twenty or more characters here')).toContain('spaces');
    expect(passphraseProblem('twenty or more characters here')).toBeUndefined();
  });

  test('suggests random, readable passphrases that pass the policy', () => {
    const suggestions = Array.from({ length: 50 }, suggestPassphrase);

    for (const suggestion of suggestions) {
      expect(suggestion).toMatch(/^[2-9a-km-np-z]{4}(-[2-9a-km-np-z]{4}){4}$/);
      expect(passphraseProblem(suggestion)).toBeUndefined();
    }
    expect(new Set(suggestions).size).toBe(suggestions.length);
  });
});
