import {
  fromBase64,
  IV_BYTES,
  KDF_NAME,
  parseVaultBlob,
  SALT_BYTES,
  toBase64,
  VaultError,
  type VaultBlob,
} from './vaultCrypto';

/**
 * Packs a version 2 vault blob into a URL fragment, so a loan can move between devices as a
 * link. The fragment holds only ciphertext and never reaches a server. The passphrase is
 * never part of the link. See docs/vault.md.
 *
 * Binary layout, then base64url without padding:
 * version (1) | iterations (4, big-endian) | salt (16) | wrap iv (12) | wrap ct (48) |
 * data iv (12) | data ct (rest)
 */

export const LINK_PREFIX = 'open=';
/** Longest link text accepted before decoding. A 16 KB bucket encodes to about 22,000 characters. */
export const MAX_LINK_CHARS = 32_000;
const WRAPPED_KEY_BYTES = 32 + 16;
const HEADER_BYTES = 1 + 4 + SALT_BYTES + IV_BYTES + WRAPPED_KEY_BYTES + IV_BYTES;

/**
 * Encodes a version 2 blob as compact base64url text.
 *
 * @param blob - Vault blob made in the browser.
 * @returns Link-safe text.
 */
export function encodeVaultLink(blob: VaultBlob): string {
  if (blob.v !== 2) {
    throw new VaultError('bad-blob', 'Only loans saved in the browser can be shared by link.');
  }

  const parts = [
    fromBase64(blob.kdf.salt),
    fromBase64(blob.wrap.iv),
    fromBase64(blob.wrap.ct),
    fromBase64(blob.data.iv),
    fromBase64(blob.data.ct),
  ];
  const total = 5 + parts.reduce((sum, part) => sum + part.length, 0);
  const bytes = new Uint8Array(total);
  bytes[0] = blob.v;
  new DataView(bytes.buffer).setUint32(1, blob.kdf.iterations, false);

  let offset = 5;
  for (const part of parts) {
    bytes.set(part, offset);
    offset += part.length;
  }

  return toBase64(bytes).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Decodes link text back into a checked vault blob. Treats the text as hostile: caps its
 * length, checks every field's size, and runs {@link parseVaultBlob} on the result.
 *
 * @param text - Base64url text from a link.
 * @param minIterations - Lowest iteration count accepted; only tests lower this.
 * @returns The vault blob.
 */
export function decodeVaultLink(text: string, minIterations?: number): VaultBlob {
  if (text.length === 0 || text.length > MAX_LINK_CHARS || !/^[A-Za-z0-9_-]+$/.test(text)) {
    throw invalidLink();
  }

  const base64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bytes = fromBase64(base64.padEnd(Math.ceil(base64.length / 4) * 4, '='));

  if (bytes.length <= HEADER_BYTES || bytes[0] !== 2) {
    throw invalidLink();
  }

  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  let offset = 5;
  const take = (length: number): string => {
    const slice = bytes.subarray(offset, offset + length);
    offset += length;
    return toBase64(slice);
  };
  const salt = take(SALT_BYTES);
  const wrapIv = take(IV_BYTES);
  const wrapCt = take(WRAPPED_KEY_BYTES);
  const dataIv = take(IV_BYTES);
  const dataCt = take(bytes.length - offset);

  try {
    return parseVaultBlob(
      {
        v: 2,
        kdf: { name: KDF_NAME, iterations: view.getUint32(1, false), salt },
        wrap: { iv: wrapIv, ct: wrapCt },
        data: { iv: dataIv, ct: dataCt },
      },
      minIterations,
    );
  } catch {
    throw invalidLink();
  }
}

/**
 * Builds the full link for a blob on this site.
 *
 * @param blob - Version 2 vault blob.
 * @param location - Where the site is served; only origin and path are used.
 * @param location.origin - Site origin.
 * @param location.pathname - Site path.
 * @returns A link that opens the loan on any device.
 */
export function linkFromBlob(
  blob: VaultBlob,
  location: { origin: string; pathname: string },
): string {
  return `${location.origin}${location.pathname}#${LINK_PREFIX}${encodeVaultLink(blob)}`;
}

/**
 * Finds the encoded blob in a URL hash or in a pasted link.
 *
 * @param text - A hash such as `#open=…`, or a whole pasted link.
 * @returns The encoded text, or `undefined` when there is none.
 */
export function linkTextFrom(text: string): string | undefined {
  const marker = `#${LINK_PREFIX}`;
  const start = text.trim().indexOf(marker);
  return start === -1 ? undefined : text.trim().slice(start + marker.length);
}

function invalidLink(): VaultError {
  return new VaultError(
    'bad-blob',
    "This link doesn't hold a loan. Check that it was copied whole.",
  );
}
