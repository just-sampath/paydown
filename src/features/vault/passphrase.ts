/**
 * Passphrase policy shared by the vault CLI and the browser. A browser loan can travel as a
 * link, so it faces the same offline guessing as the public set a file and gets the same rule.
 */

export const MIN_PASSPHRASE_LENGTH = 20;

/** No 0, 1, l or o, so it reads back from paper without doubt. Exactly 32 symbols. */
const ALPHABET = '23456789abcdefghijkmnpqrstuvwxyz';
const GROUPS = 5;
const GROUP_LENGTH = 4;

/**
 * Checks the passphrase policy.
 *
 * @param passphrase - Candidate passphrase.
 * @returns An error message, or `undefined` when acceptable.
 */
export function passphraseProblem(passphrase: string): string | undefined {
  if (Array.from(passphrase).length < MIN_PASSPHRASE_LENGTH) {
    return `Use at least ${MIN_PASSPHRASE_LENGTH} characters. Five or more random words work well.`;
  }

  if (passphrase.trim() !== passphrase) {
    return 'Remove the spaces at the start or end. They are easy to lose.';
  }

  return undefined;
}

/**
 * Makes a random passphrase: 5 groups of 4 symbols from a 32-symbol alphabet (100 bits).
 *
 * @returns A passphrase such as `k7qm-x2pd-9wrt-h4zn-c8fa`.
 */
export function suggestPassphrase(): string {
  const bytes = globalThis.crypto.getRandomValues(new Uint8Array(GROUPS * GROUP_LENGTH));
  // 256 is a multiple of 32, so taking each byte modulo 32 has no bias.
  const symbols = Array.from(bytes, (byte) => ALPHABET[byte % ALPHABET.length] ?? '2');
  const groups: string[] = [];

  for (let index = 0; index < symbols.length; index += GROUP_LENGTH) {
    groups.push(symbols.slice(index, index + GROUP_LENGTH).join(''));
  }

  return groups.join('-');
}
