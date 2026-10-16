// @vitest-environment node
import { describe, expect, test } from 'vitest';

import { sampleLoan } from '../../../src/config/sampleLoan';
import type { LoanProfile } from '../../../src/features/vault/loanProfile';
import {
  DEFAULT_ITERATIONS,
  MAX_PAYLOAD_BYTES,
  openBlob,
  openBlobWithKey,
  PADDED_BYTES,
  padPayload,
  sealProfile,
  unpadPayload,
  VaultError,
  type VaultBlob,
} from '../../../src/features/vault/vaultCrypto';

const PASSPHRASE = 'correct horse battery staple paperclip';
// Test-only speed-up; real blobs are refused below MIN_ITERATIONS.
const FAST = { iterations: 1_000, minIterations: 1_000 };
const GCM_TAG_BYTES = 16;

describe('vault crypto', () => {
  test('round-trips a profile exactly', async () => {
    const blob = await sealProfile(sampleLoan, PASSPHRASE, FAST);
    const opened = await openBlob(blob, PASSPHRASE, FAST);

    expect(opened.profile).toEqual(sampleLoan);
    expect(JSON.stringify(blob)).not.toContain('Sample Bank');
  });

  test('rejects a wrong passphrase with a typed error and no data', async () => {
    const blob = await sealProfile(sampleLoan, PASSPHRASE, FAST);
    const attempt = openBlob(blob, `${PASSPHRASE}!`, FAST);

    await expect(attempt).rejects.toBeInstanceOf(VaultError);
    await expect(attempt).rejects.toMatchObject({ code: 'bad-passphrase' });
  });

  test('pads every payload to the same ciphertext size', async () => {
    const tiny = await sealProfile(
      { ...sampleLoan, loan: { ...sampleLoan.loan, rateChanges: [], partPayments: [] } },
      PASSPHRASE,
      FAST,
    );
    const large = await sealProfile(profileNearLimit(), PASSPHRASE, FAST);

    expect(decodedLength(tiny.data.ct)).toBe(PADDED_BYTES + GCM_TAG_BYTES);
    expect(decodedLength(large.data.ct)).toBe(PADDED_BYTES + GCM_TAG_BYTES);
    expect(tiny.data.ct.length).toBe(large.data.ct.length);
    expect(padPayload(sampleLoan)).toHaveLength(PADDED_BYTES);
    expect(JSON.parse(unpadPayload(padPayload(sampleLoan)))).toEqual(sampleLoan);
  });

  test('refuses a profile larger than the fixed size instead of growing', async () => {
    const tooLarge = profileNearLimit(MAX_PAYLOAD_BYTES + 200);

    await expect(sealProfile(tooLarge, PASSPHRASE, FAST)).rejects.toMatchObject({
      code: 'too-large',
    });
  });

  test('uses a fresh salt and fresh IVs for every encryption', async () => {
    const first = await sealProfile(sampleLoan, PASSPHRASE, FAST);
    const opened = await openBlob(first, PASSPHRASE, { ...FAST, extractableDek: true });
    const second = await sealProfile(sampleLoan, PASSPHRASE, { ...FAST, dek: opened.dek });

    expect(second.kdf.salt).not.toBe(first.kdf.salt);
    expect(second.wrap.iv).not.toBe(first.wrap.iv);
    expect(second.data.iv).not.toBe(first.data.iv);
    expect(second.wrap.ct).not.toBe(first.wrap.ct);
    expect(second.data.ct).not.toBe(first.data.ct);
  });

  test('authenticates the header so parameters cannot be tampered with', async () => {
    const blob = await sealProfile(sampleLoan, PASSPHRASE, {
      iterations: 1_001,
      minIterations: 1_000,
    });
    const lowered: VaultBlob = { ...blob, kdf: { ...blob.kdf, iterations: 1_000 } };
    const otherSalt = await sealProfile(sampleLoan, PASSPHRASE, FAST);
    const swappedSalt: VaultBlob = { ...blob, kdf: { ...blob.kdf, salt: otherSalt.kdf.salt } };

    await expect(openBlob(lowered, PASSPHRASE, FAST)).rejects.toMatchObject({
      code: 'bad-passphrase',
    });
    await expect(openBlob(swappedSalt, PASSPHRASE, FAST)).rejects.toMatchObject({
      code: 'bad-passphrase',
    });
  });

  test('refuses iteration counts below the floor', async () => {
    const blob = await sealProfile(sampleLoan, PASSPHRASE, FAST);

    await expect(openBlob(blob, PASSPHRASE)).rejects.toMatchObject({ code: 'bad-blob' });
    await expect(sealProfile(sampleLoan, PASSPHRASE, { iterations: 1_000 })).rejects.toMatchObject({
      code: 'bad-blob',
    });
  });

  test('keeps remembered keys working across re-seals until the data key rotates', async () => {
    const first = await sealProfile(sampleLoan, PASSPHRASE, FAST);
    const remembered = (await openBlob(first, PASSPHRASE, FAST)).dek;
    const cli = await openBlob(first, PASSPHRASE, { ...FAST, extractableDek: true });
    const resealed = await sealProfile(sampleLoan, 'another passphrase of decent length', {
      ...FAST,
      dek: cli.dek,
    });
    const rotated = await sealProfile(sampleLoan, PASSPHRASE, FAST);

    expect(remembered.extractable).toBe(false);
    expect(remembered.usages).toEqual(['decrypt']);
    await expect(openBlobWithKey(resealed, remembered, FAST)).resolves.toEqual(sampleLoan);
    await expect(openBlobWithKey(rotated, remembered, FAST)).rejects.toMatchObject({
      code: 'bad-passphrase',
    });
  });

  test('uses one million PBKDF2 iterations by default', async () => {
    const blob = await sealProfile(sampleLoan, PASSPHRASE);

    expect(DEFAULT_ITERATIONS).toBe(1_000_000);
    expect(blob.kdf).toMatchObject({ name: 'PBKDF2-SHA256', iterations: 1_000_000 });
    await expect(openBlob(blob, PASSPHRASE)).resolves.toMatchObject({ profile: sampleLoan });
  }, 30_000);
});

function profileNearLimit(targetBytes = MAX_PAYLOAD_BYTES - 64): LoanProfile {
  const profile: LoanProfile = {
    ...sampleLoan,
    meta: { ...sampleLoan.meta, name: '' },
  };
  const base = new TextEncoder().encode(
    JSON.stringify({ ...profile, meta: { ...profile.meta, name: 'x' } }),
  ).length;
  return { ...profile, meta: { ...profile.meta, name: 'x'.repeat(targetBytes - base + 1) } };
}

function decodedLength(base64: string): number {
  return atob(base64).length;
}
