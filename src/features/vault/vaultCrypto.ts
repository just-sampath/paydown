import { parseLoanProfile, type LoanProfile } from './loanProfile';

/**
 * Passphrase-encrypted loan vault.
 *
 * Envelope design: a random data key (DEK) encrypts the padded profile; a key derived
 * from the passphrase (KEK, PBKDF2-SHA256) wraps the DEK. Both layers use AES-256-GCM
 * with the header bound as additional authenticated data. See docs/vault.md.
 *
 * Pure WebCrypto: runs unchanged in browsers, Bun, and Node.
 */

export const VAULT_VERSION = 1;
export const KDF_NAME = 'PBKDF2-SHA256';
export const DEFAULT_ITERATIONS = 1_000_000;
export const MIN_ITERATIONS = 600_000;
export const MAX_ITERATIONS = 10_000_000;
export const PADDED_BYTES = 16_384;
export const MAX_PAYLOAD_BYTES = PADDED_BYTES - 4;
const SALT_BYTES = 16;
const IV_BYTES = 12;
const AAD_PREFIX = 'paydown-vault';

export type VaultBlob = {
  v: 1;
  kdf: { name: typeof KDF_NAME; iterations: number; salt: string };
  wrap: { iv: string; ct: string };
  data: { iv: string; ct: string };
};

export type VaultErrorCode = 'bad-passphrase' | 'bad-blob' | 'too-large';

export class VaultError extends Error {
  readonly code: VaultErrorCode;

  constructor(code: VaultErrorCode, message: string) {
    super(message);
    this.name = 'VaultError';
    this.code = code;
  }
}

export type SealOptions = {
  /** Existing data key to keep (so remembered devices keep working). A new one is generated when omitted. */
  dek?: CryptoKey;
  /** PBKDF2 iterations; defaults to {@link DEFAULT_ITERATIONS}. */
  iterations?: number;
  /** Lowest iteration count accepted; only tests lower this. */
  minIterations?: number;
};

export type OpenOptions = {
  /** Lowest iteration count accepted; only tests lower this. */
  minIterations?: number;
  /** Whether the unwrapped data key may be exported. Only the CLI needs `true` (to re-wrap it). */
  extractableDek?: boolean;
};

export type OpenedVault = {
  profile: LoanProfile;
  dek: CryptoKey;
};

/**
 * Encrypts a loan profile with a passphrase. Every call uses a fresh salt and fresh IVs.
 *
 * @param profile - Validated loan profile to encrypt.
 * @param passphrase - Secret passphrase; never stored.
 * @param options - Optional data key to keep and iteration settings.
 * @returns JSON-serializable vault blob.
 */
export async function sealProfile(
  profile: LoanProfile,
  passphrase: string,
  options: SealOptions = {},
): Promise<VaultBlob> {
  const iterations = options.iterations ?? DEFAULT_ITERATIONS;
  assertIterations(iterations, options.minIterations ?? MIN_ITERATIONS);

  const subtle = getSubtle();
  const salt = randomBytes(SALT_BYTES);
  const saltText = toBase64(salt);
  const kek = await deriveKek(passphrase, salt, iterations);
  const dek = options.dek ?? (await generateDek());
  const wrapIv = randomBytes(IV_BYTES);
  const dataIv = randomBytes(IV_BYTES);
  const wrapped = await subtle.wrapKey('raw', dek, kek, {
    name: 'AES-GCM',
    iv: wrapIv,
    additionalData: aad(iterations, saltText, 'wrap'),
  });
  const ciphertext = await subtle.encrypt(
    { name: 'AES-GCM', iv: dataIv, additionalData: aad(iterations, saltText, 'data') },
    dek,
    padPayload(profile),
  );

  return {
    v: VAULT_VERSION,
    kdf: { name: KDF_NAME, iterations, salt: saltText },
    wrap: { iv: toBase64(wrapIv), ct: toBase64(new Uint8Array(wrapped)) },
    data: { iv: toBase64(dataIv), ct: toBase64(new Uint8Array(ciphertext)) },
  };
}

/**
 * Decrypts a vault blob with a passphrase.
 *
 * A wrong passphrase and a tampered blob both fail with `bad-passphrase`, on purpose.
 *
 * @param input - Parsed vault JSON of unknown shape.
 * @param passphrase - Passphrase to try.
 * @param options - Iteration floor and DEK extractability.
 * @returns The decrypted, validated profile and the unwrapped data key.
 */
export async function openBlob(
  input: unknown,
  passphrase: string,
  options: OpenOptions = {},
): Promise<OpenedVault> {
  const blob = parseVaultBlob(input, options.minIterations ?? MIN_ITERATIONS);
  const salt = fromBase64(blob.kdf.salt);
  const kek = await deriveKek(passphrase, salt, blob.kdf.iterations);
  let dek: CryptoKey;

  try {
    dek = await getSubtle().unwrapKey(
      'raw',
      fromBase64(blob.wrap.ct),
      kek,
      {
        name: 'AES-GCM',
        iv: fromBase64(blob.wrap.iv),
        additionalData: aad(blob.kdf.iterations, blob.kdf.salt, 'wrap'),
      },
      { name: 'AES-GCM' },
      options.extractableDek ?? false,
      options.extractableDek === true ? ['encrypt', 'decrypt'] : ['decrypt'],
    );
  } catch {
    throw new VaultError('bad-passphrase', "That passphrase didn't unlock this data set.");
  }

  return { profile: await decryptData(blob, dek), dek };
}

/**
 * Decrypts a vault blob with a previously unwrapped data key (a remembered device).
 *
 * @param input - Parsed vault JSON of unknown shape.
 * @param dek - Data key from an earlier successful unlock.
 * @param options - Iteration floor.
 * @returns The decrypted, validated profile.
 */
export async function openBlobWithKey(
  input: unknown,
  dek: CryptoKey,
  options: Pick<OpenOptions, 'minIterations'> = {},
): Promise<LoanProfile> {
  const blob = parseVaultBlob(input, options.minIterations ?? MIN_ITERATIONS);
  return decryptData(blob, dek);
}

/**
 * Pads a profile to exactly {@link PADDED_BYTES}: 4-byte big-endian length, compact JSON, zero fill.
 *
 * @param profile - Profile to serialize.
 * @returns Fixed-size plaintext buffer.
 */
export function padPayload(profile: LoanProfile): Uint8Array<ArrayBuffer> {
  const json = new TextEncoder().encode(JSON.stringify(profile));

  if (json.length > MAX_PAYLOAD_BYTES) {
    throw new VaultError(
      'too-large',
      `Profile is ${json.length} bytes; the fixed vault size allows ${MAX_PAYLOAD_BYTES}.`,
    );
  }

  const padded = new Uint8Array(PADDED_BYTES);
  new DataView(padded.buffer).setUint32(0, json.length, false);
  padded.set(json, 4);
  return padded;
}

/**
 * Reverses {@link padPayload}.
 *
 * @param padded - Fixed-size plaintext buffer.
 * @returns The JSON text inside.
 */
export function unpadPayload(padded: Uint8Array): string {
  if (padded.length !== PADDED_BYTES) {
    throw new VaultError('bad-blob', 'Decrypted payload has the wrong size.');
  }

  const length = new DataView(padded.buffer, padded.byteOffset, padded.byteLength).getUint32(
    0,
    false,
  );

  if (length > MAX_PAYLOAD_BYTES) {
    throw new VaultError('bad-blob', 'Decrypted payload has an invalid length.');
  }

  return new TextDecoder('utf-8', { fatal: true }).decode(padded.subarray(4, 4 + length));
}

/**
 * Checks the outer shape and parameters of a vault blob without decrypting it.
 *
 * @param input - Parsed JSON of unknown shape.
 * @param minIterations - Lowest iteration count accepted.
 * @returns The typed blob.
 */
export function parseVaultBlob(input: unknown, minIterations = MIN_ITERATIONS): VaultBlob {
  const blob = input as Partial<VaultBlob> | null;
  const isText = (value: unknown): value is string => typeof value === 'string' && value !== '';

  if (
    typeof blob !== 'object' ||
    blob === null ||
    blob.v !== VAULT_VERSION ||
    blob.kdf?.name !== KDF_NAME ||
    typeof blob.kdf.iterations !== 'number' ||
    !isText(blob.kdf.salt) ||
    !isText(blob.wrap?.iv) ||
    !isText(blob.wrap.ct) ||
    !isText(blob.data?.iv) ||
    !isText(blob.data.ct)
  ) {
    throw new VaultError('bad-blob', 'This is not a recognised vault file.');
  }

  assertIterations(blob.kdf.iterations, minIterations);
  return blob as VaultBlob;
}

async function decryptData(blob: VaultBlob, dek: CryptoKey): Promise<LoanProfile> {
  let plaintext: ArrayBuffer;

  try {
    plaintext = await getSubtle().decrypt(
      {
        name: 'AES-GCM',
        iv: fromBase64(blob.data.iv),
        additionalData: aad(blob.kdf.iterations, blob.kdf.salt, 'data'),
      },
      dek,
      fromBase64(blob.data.ct),
    );
  } catch {
    throw new VaultError('bad-passphrase', "That passphrase didn't unlock this data set.");
  }

  try {
    return parseLoanProfile(JSON.parse(unpadPayload(new Uint8Array(plaintext))));
  } catch (error) {
    if (error instanceof VaultError) {
      throw error;
    }
    throw new VaultError('bad-blob', `Decrypted data is not a valid loan profile.`);
  }
}

async function deriveKek(
  passphrase: string,
  salt: Uint8Array<ArrayBuffer>,
  iterations: number,
): Promise<CryptoKey> {
  const subtle = getSubtle();
  const material = await subtle.importKey(
    'raw',
    new TextEncoder().encode(passphrase.normalize('NFC')),
    'PBKDF2',
    false,
    ['deriveKey'],
  );

  return subtle.deriveKey(
    { name: 'PBKDF2', hash: 'SHA-256', salt, iterations },
    material,
    { name: 'AES-GCM', length: 256 },
    false,
    ['wrapKey', 'unwrapKey'],
  );
}

/**
 * Generates a fresh extractable data key. Extractable only so it can be wrapped.
 *
 * @returns AES-256-GCM key.
 */
export function generateDek(): Promise<CryptoKey> {
  return getSubtle().generateKey({ name: 'AES-GCM', length: 256 }, true, [
    'encrypt',
    'decrypt',
  ]) as Promise<CryptoKey>;
}

function assertIterations(iterations: number, minIterations: number): void {
  if (!Number.isInteger(iterations) || iterations < minIterations || iterations > MAX_ITERATIONS) {
    throw new VaultError(
      'bad-blob',
      `PBKDF2 iterations must be an integer between ${minIterations} and ${MAX_ITERATIONS}.`,
    );
  }
}

function aad(iterations: number, salt: string, layer: 'wrap' | 'data'): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode(
    [AAD_PREFIX, VAULT_VERSION, KDF_NAME, iterations, salt, layer].join('|'),
  );
}

function getSubtle(): SubtleCrypto {
  const subtle = globalThis.crypto?.subtle;

  if (subtle === undefined) {
    throw new Error('WebCrypto is unavailable. Open the site over HTTPS or localhost.');
  }

  return subtle;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  return globalThis.crypto.getRandomValues(new Uint8Array(length));
}

function toBase64(bytes: Uint8Array): string {
  let binary = '';
  bytes.forEach((byte) => {
    binary += String.fromCharCode(byte);
  });
  return btoa(binary);
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  let binary: string;

  try {
    binary = atob(text);
  } catch {
    throw new VaultError('bad-blob', 'This is not a recognised vault file.');
  }

  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}
