// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { sampleLoan } from '../../../src/config/sampleLoan';
import { openBlob, sealProfile, type VaultBlob } from '../../../src/features/vault/vaultCrypto';
import {
  decodeVaultLink,
  encodeVaultLink,
  linkFromBlob,
  linkTextFrom,
  MAX_LINK_CHARS,
} from '../../../src/features/vault/vaultLink';

const PASSPHRASE = 'correct horse battery staple paperclip';
const FAST = { iterations: 1_000, minIterations: 1_000 };

async function v2Blob(): Promise<VaultBlob> {
  return sealProfile(sampleLoan, PASSPHRASE, { ...FAST, version: 2 });
}

describe('vault links', () => {
  test('round-trips a version 2 blob through compact, URL-safe text', async () => {
    const blob = await v2Blob();
    const text = encodeVaultLink(blob);

    expect(text).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(text.length).toBeLessThan(3_000);
    expect(decodeVaultLink(text, FAST.minIterations)).toEqual(blob);
    await expect(
      openBlob(decodeVaultLink(text, FAST.minIterations), PASSPHRASE, FAST),
    ).resolves.toMatchObject({ profile: sampleLoan });
  });

  test('puts the blob in the fragment and never the passphrase', async () => {
    const blob = await v2Blob();
    const link = linkFromBlob(blob, { origin: 'https://site.test', pathname: '/paydown/' });

    expect(link.startsWith('https://site.test/paydown/#open=')).toBe(true);
    expect(link).not.toContain(PASSPHRASE);
    expect(link).not.toContain('Sample');
    expect(linkTextFrom(link)).toBe(encodeVaultLink(blob));
    expect(linkTextFrom('#open=abc')).toBe('abc');
    expect(linkTextFrom('#settings')).toBeUndefined();
  });

  test('refuses version 1 blobs, which are a fixed 16 KB', async () => {
    const blob = await sealProfile(sampleLoan, PASSPHRASE, FAST);
    expect(() => encodeVaultLink(blob)).toThrow('Only loans saved in the browser');
  });

  test('treats link text as hostile', async () => {
    const text = encodeVaultLink(await v2Blob());
    const refuse = (input: string) =>
      expect(() => decodeVaultLink(input, FAST.minIterations)).toThrow(
        "This link doesn't hold a loan.",
      );

    refuse('');
    refuse('not base64!');
    refuse('A'.repeat(MAX_LINK_CHARS + 1));
    refuse(text.slice(0, 40));
    refuse(`B${text.slice(1)}`);
    // Iterations below the real floor (a weak or tampered link) are refused by default.
    expect(() => decodeVaultLink(text)).toThrow("This link doesn't hold a loan.");
  });
});
