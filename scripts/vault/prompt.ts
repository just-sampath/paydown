/**
 * Terminal prompts for the vault CLI. Passphrases are read with echo off, only from an
 * interactive terminal, and never from arguments, environment variables, or files.
 */

import { passphraseProblem } from '../../src/features/vault/passphrase';

export { MIN_PASSPHRASE_LENGTH, passphraseProblem } from '../../src/features/vault/passphrase';

/**
 * Fails fast when stdin is not an interactive terminal (piped input, CI, some Git Bash setups).
 *
 * @returns Nothing.
 */
export function requireTty(): void {
  if (!process.stdin.isTTY || typeof process.stdin.setRawMode !== 'function') {
    throw new Error(
      'The vault needs an interactive terminal to read the passphrase. Run it from PowerShell or Windows Terminal.',
    );
  }
}

/**
 * Reads a line with echo off, showing `*` per character.
 *
 * @param label - Prompt text.
 * @returns What was typed.
 */
export function readHidden(label: string): Promise<string> {
  requireTty();
  process.stdout.write(label);

  return new Promise((resolve) => {
    const stdin = process.stdin;
    let value = '';

    const finish = (): void => {
      stdin.setRawMode(false);
      stdin.pause();
      stdin.off('data', onData);
      process.stdout.write('\n');
    };

    const onData = (chunk: Buffer): void => {
      for (const char of chunk.toString('utf8')) {
        if (char === '\u0003') {
          finish();
          process.stdout.write('Cancelled.\n');
          process.exit(130);
        } else if (char === '\r' || char === '\n') {
          finish();
          resolve(value);
          return;
        } else if (char === '\u007f' || char === '\b') {
          if (value.length > 0) {
            value = Array.from(value).slice(0, -1).join('');
            process.stdout.write('\b \b');
          }
        } else if (char >= ' ') {
          value += char;
          process.stdout.write('*');
        }
      }
    };

    stdin.setRawMode(true);
    stdin.resume();
    stdin.on('data', onData);
  });
}

/**
 * Reads a visible line (for confirmations).
 *
 * @param label - Prompt text.
 * @returns Trimmed answer.
 */
export async function readLine(label: string): Promise<string> {
  requireTty();
  process.stdout.write(label);

  return new Promise((resolve) => {
    const onData = (chunk: Buffer): void => {
      process.stdin.off('data', onData);
      process.stdin.pause();
      resolve(chunk.toString('utf8').trim());
    };
    process.stdin.resume();
    process.stdin.on('data', onData);
  });
}

/**
 * Asks for a new passphrase twice until it meets the policy and both entries match.
 *
 * @param allowKeep - When true, an empty first entry returns `undefined` (keep the current one).
 * @returns The new passphrase, or `undefined` to keep the current one.
 */
export async function readNewPassphrase(allowKeep: boolean): Promise<string | undefined> {
  for (;;) {
    const first = await readHidden(
      allowKeep ? 'New passphrase (Enter to keep current): ' : 'New passphrase: ',
    );

    if (allowKeep && first === '') {
      return undefined;
    }

    const problem = passphraseProblem(first);
    if (problem !== undefined) {
      process.stdout.write(`${problem}\n`);
      continue;
    }

    const second = await readHidden('Repeat new passphrase: ');
    if (first !== second) {
      process.stdout.write('The two entries differ. Try again.\n');
      continue;
    }

    return first;
  }
}
