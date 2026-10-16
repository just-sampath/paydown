/**
 * Paydown vault CLI: the only way to change the encrypted "set a" data set.
 *
 * Usage: bun run vault <command> [flags]   (see `bun run vault help`)
 *
 * Every change needs the current passphrase, re-encrypts with a fresh salt and fresh IVs,
 * decrypts the result again to verify it, and writes atomically. It never runs git.
 */
import { existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';

import { parseLoanProfile, type LoanProfile } from '../src/features/vault/loanProfile';
import {
  openBlob,
  sealProfile,
  VaultError,
  type VaultBlob,
} from '../src/features/vault/vaultCrypto';
import {
  addPayment,
  addRate,
  CommandError,
  countProfile,
  describeProfile,
  parseDateFlag,
  parseNonNegativeNumber,
  parsePositiveNumber,
  removePayment,
  removeRate,
} from './vault/commands';
import { readHidden, readLine, readNewPassphrase, requireTty } from './vault/prompt';

const ROOT = join(import.meta.dir, '..');
const VAULT_PATH = join(ROOT, 'src', 'vault', 'set-a.vault.json');
const DEFAULT_PLAIN_PATH = join(ROOT, '.private', 'set-a.json');

const HELP = `Paydown vault — manage the encrypted "set a" data set

  bun run vault init [--file <plain.json>] [--force]   encrypt a plaintext profile for the first time
  bun run vault add-payment --date YYYY-MM-DD --amount N
  bun run vault remove-payment --date YYYY-MM-DD [--amount N]
  bun run vault add-rate --date YYYY-MM-DD --rate N
  bun run vault remove-rate --date YYYY-MM-DD
  bun run vault list                                    print events (your terminal only)
  bun run vault export [--file <plain.json>] [--force]  decrypt to a gitignored file for bulk edits
  bun run vault seal [--file <plain.json>]              re-encrypt from that file
  bun run vault passwd                                  change passphrase (revokes remembered devices)
  bun run vault verify                                  decrypt and validate; prints counts only

Passphrases are always typed at a hidden prompt. Default plaintext file: .private/set-a.json`;

type Flags = Record<string, string | true>;

async function main(argv: string[]): Promise<void> {
  const [command, ...rest] = argv;
  const flags = parseFlags(rest);

  switch (command) {
    case 'init':
      return init(flags);
    case 'add-payment':
      return mutate((profile) =>
        addPayment(profile, {
          date: parseDateFlag(text(flags.date)),
          amount: parsePositiveNumber(text(flags.amount), 'amount'),
        }),
      );
    case 'remove-payment':
      return mutate((profile) =>
        removePayment(profile, {
          date: parseDateFlag(text(flags.date)),
          ...(flags.amount === undefined
            ? {}
            : { amount: parsePositiveNumber(text(flags.amount), 'amount') }),
        }),
      );
    case 'add-rate':
      return mutate((profile) =>
        addRate(profile, {
          date: parseDateFlag(text(flags.date)),
          rate: parseNonNegativeNumber(text(flags.rate), 'rate'),
        }),
      );
    case 'remove-rate':
      return mutate((profile) => removeRate(profile, { date: parseDateFlag(text(flags.date)) }));
    case 'list': {
      const { profile } = await unlockExisting();
      process.stdout.write(`${describeProfile(profile).join('\n')}\n`);
      return;
    }
    case 'export':
      return exportPlain(flags);
    case 'seal':
      return sealPlain(flags);
    case 'passwd':
      return passwd();
    case 'verify': {
      const { profile } = await unlockExisting();
      process.stdout.write(`OK · ${countProfile(profile)}\n`);
      return;
    }
    default:
      process.stdout.write(`${HELP}\n`);
      if (command !== undefined && command !== 'help') {
        process.exitCode = 1;
      }
  }
}

async function init(flags: Flags): Promise<void> {
  if (existsSync(VAULT_PATH) && flags.force !== true) {
    throw new CommandError(
      `${rel(
        VAULT_PATH,
      )} already exists. Use "seal" to update it, or --force to replace it with a new passphrase.`,
    );
  }

  const plainPath = plainPathFrom(flags);
  const profile = readPlain(plainPath);
  requireTty();
  const passphrase = await readNewPassphrase(false);

  await writeVault(profile, passphrase as string, undefined);
  process.stdout.write(`Encrypted ${countProfile(profile)}.\n`);
  await offerToDelete(plainPath);
}

async function mutate(change: (profile: LoanProfile) => LoanProfile): Promise<void> {
  const unlocked = await unlockExisting(true);
  const updated = change(unlocked.profile);
  process.stdout.write(`Change applied in memory: ${countProfile(updated)}.\n`);
  await resealWithOptionalNewPassphrase(updated, unlocked);
}

async function exportPlain(flags: Flags): Promise<void> {
  const plainPath = plainPathFrom(flags);

  if (existsSync(plainPath) && flags.force !== true) {
    throw new CommandError(`${rel(plainPath)} already exists; pass --force to overwrite it.`);
  }

  const { profile } = await unlockExisting();
  mkdirSync(dirname(plainPath), { recursive: true });
  writeFileSync(plainPath, `${JSON.stringify(profile, null, 2)}\n`, { mode: 0o600 });
  process.stdout.write(
    `Wrote ${rel(plainPath)} (gitignored). Edit it, then run "bun run vault seal".\n`,
  );
}

async function sealPlain(flags: Flags): Promise<void> {
  const plainPath = plainPathFrom(flags);
  const edited = readPlain(plainPath);
  const unlocked = await unlockExisting(true);

  await resealWithOptionalNewPassphrase(edited, unlocked);
  await offerToDelete(plainPath);
}

async function passwd(): Promise<void> {
  const { profile } = await unlockExisting(true);
  const passphrase = await readNewPassphrase(false);

  await writeVault(profile, passphrase as string, undefined);
  process.stdout.write(
    'Passphrase changed and data key rotated: remembered devices must unlock again.\n',
  );
}

type Unlocked = { profile: LoanProfile; dek: CryptoKey; passphrase: string };

async function unlockExisting(extractableDek = false): Promise<Unlocked> {
  if (!existsSync(VAULT_PATH)) {
    throw new CommandError(`${rel(VAULT_PATH)} does not exist yet. Run "bun run vault init".`);
  }

  const blob = JSON.parse(readFileSync(VAULT_PATH, 'utf8')) as unknown;
  const passphrase = await readHidden('Current passphrase: ');
  const opened = await openBlob(blob, passphrase, { extractableDek });

  return { ...opened, passphrase };
}

async function resealWithOptionalNewPassphrase(
  profile: LoanProfile,
  unlocked: Unlocked,
): Promise<void> {
  const newPassphrase = await readNewPassphrase(true);

  if (newPassphrase === undefined) {
    await writeVault(profile, unlocked.passphrase, unlocked.dek);
    process.stdout.write('Saved with the same passphrase.\n');
  } else {
    await writeVault(profile, newPassphrase, undefined);
    process.stdout.write(
      'Saved with a new passphrase; data key rotated, so remembered devices must unlock again.\n',
    );
  }
}

async function writeVault(
  profile: LoanProfile,
  passphrase: string,
  dek: CryptoKey | undefined,
): Promise<void> {
  process.stdout.write('Encrypting (PBKDF2, about a second)…\n');
  const blob: VaultBlob = await sealProfile(profile, passphrase, dek === undefined ? {} : { dek });
  const check = await openBlob(blob, passphrase);

  if (JSON.stringify(check.profile) !== JSON.stringify(parseLoanProfile(profile))) {
    throw new Error('Verification failed: the new vault did not decrypt to the same data.');
  }

  const tempPath = VAULT_PATH.replace(/\.json$/, '.tmp');
  mkdirSync(dirname(VAULT_PATH), { recursive: true });
  writeFileSync(tempPath, `${JSON.stringify(blob, null, 2)}\n`);
  renameSync(tempPath, VAULT_PATH);
  process.stdout.write(
    `Wrote ${rel(VAULT_PATH)}. Review it with git diff, then commit it yourself.\n`,
  );
}

async function offerToDelete(plainPath: string): Promise<void> {
  const answer = await readLine(`Delete the plaintext ${rel(plainPath)} now? [Y/n] `);

  if (answer === '' || /^y(es)?$/i.test(answer)) {
    rmSync(plainPath);
    process.stdout.write('Plaintext deleted.\n');
  } else {
    process.stdout.write('Kept. It is gitignored; delete it when you are done.\n');
  }
}

function readPlain(plainPath: string): LoanProfile {
  if (!existsSync(plainPath)) {
    throw new CommandError(`${rel(plainPath)} not found.`);
  }

  try {
    return parseLoanProfile(JSON.parse(readFileSync(plainPath, 'utf8')));
  } catch (error) {
    throw new CommandError(
      `${rel(plainPath)} is not a valid loan profile: ${(error as Error).message}`,
    );
  }
}

function plainPathFrom(flags: Flags): string {
  const file = flags.file;
  return typeof file === 'string' ? join(process.cwd(), file) : DEFAULT_PLAIN_PATH;
}

function parseFlags(args: string[]): Flags {
  const flags: Flags = {};

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index] ?? '';

    if (!arg.startsWith('--')) {
      throw new CommandError(`Unexpected argument "${arg}". Flags look like --date 2026-01-31.`);
    }

    const name = arg.slice(2);
    if (name === 'passphrase' || name === 'password') {
      throw new CommandError('Passphrases are only accepted at the hidden prompt.');
    }

    const next = args[index + 1];
    if (next === undefined || next.startsWith('--')) {
      flags[name] = true;
    } else {
      flags[name] = next;
      index += 1;
    }
  }

  return flags;
}

function text(value: string | true | undefined): string | undefined {
  return typeof value === 'string' ? value : undefined;
}

function rel(path: string): string {
  return relative(ROOT, path) || path;
}

main(process.argv.slice(2)).catch((error: unknown) => {
  if (error instanceof VaultError && error.code === 'bad-passphrase') {
    process.stderr.write("That passphrase didn't unlock set a. Nothing was changed.\n");
  } else {
    process.stderr.write(`${(error as Error).message}\nNothing was changed.\n`);
  }
  process.exit(1);
});
