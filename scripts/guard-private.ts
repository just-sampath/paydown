/**
 * CI and pre-commit guard: fails if private plaintext loan data is tracked by git.
 *
 * Usage: bun run check:private
 */
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

import { parseLoanProfile } from '../src/features/vault/loanProfile';
import { parseVaultBlob } from '../src/features/vault/vaultCrypto';

const ROOT = join(import.meta.dir, '..');

const listed = spawnSync('git', ['ls-files', '-z'], { cwd: ROOT, encoding: 'utf8' });
if (listed.status !== 0) {
  process.stderr.write(`git ls-files failed: ${listed.stderr}\n`);
  process.exit(2);
}

const files = listed.stdout.split('\0').filter((file) => file !== '');
const problems: string[] = [];

for (const file of files) {
  if (file.startsWith('.private/') || file.endsWith('.plain.json') || file.endsWith('.vault.tmp')) {
    problems.push(`${file}: private files must never be committed`);
    continue;
  }

  if (!file.endsWith('.json')) {
    continue;
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(readFileSync(join(ROOT, file), 'utf8'));
  } catch {
    continue;
  }

  if (file.endsWith('.vault.json')) {
    try {
      parseVaultBlob(parsed);
    } catch {
      problems.push(`${file}: not a valid encrypted vault`);
    }
    continue;
  }

  try {
    parseLoanProfile(parsed);
    problems.push(`${file}: looks like an unencrypted loan profile`);
  } catch {
    // Not a loan profile: fine.
  }
}

if (problems.length > 0) {
  problems.forEach((problem) => process.stderr.write(`✗ ${problem}\n`));
  process.exit(1);
}

process.stdout.write(`✓ ${files.length} tracked files contain no plaintext loan profile.\n`);
