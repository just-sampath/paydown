/**
 * Searches for plaintext traces of the private "set a" loan.
 *
 * Needles are built at runtime from .private/set-a.json (or by decrypting the vault
 * after a passphrase prompt) and are never stored or printed: hits are reported by
 * field name and format only, e.g. `README.md:12 — partPayments[3].amount (indian)`.
 *
 * Usage: bun run leak-check [--tree] [--history] [--dist] [--url <site>] [--file <plain.json>]
 * Exit code 1 when any strong match is found.
 */
import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

import { parseLoanProfile, type LoanProfile } from '../src/features/vault/loanProfile';
import { openBlob } from '../src/features/vault/vaultCrypto';
import { readHidden } from './vault/prompt';

export type Needle = { value: string; label: string; strong: boolean };
type Hit = { location: string; label: string; strong: boolean };

const ROOT = join(import.meta.dir, '..');
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Builds every textual form a loan figure could take in source, docs, or a minified bundle.
 *
 * @param profile - Private loan profile.
 * @returns Needles with labels that never contain the value itself.
 */
export function buildNeedles(profile: LoanProfile): Needle[] {
  const needles: Needle[] = [];
  const { loan, meta } = profile;

  addText(needles, meta.name, 'meta.name');
  addText(needles, meta.lender, 'meta.lender');
  addAmount(needles, loan.principal, 'principal');
  addRate(needles, loan.originalRate, 'originalRate');
  addDate(needles, loan.startDate, 'startDate');
  if (loan.preEmiInterest !== undefined) {
    addAmount(needles, loan.preEmiInterest, 'preEmiInterest');
  }
  loan.rateChanges.forEach((item, index) => {
    addDate(needles, item.date, `rateChanges[${index}].date`);
    addRate(needles, item.rate, `rateChanges[${index}].rate`);
  });
  loan.partPayments.forEach((item, index) => {
    addDate(needles, item.date, `partPayments[${index}].date`);
    addAmount(needles, item.amount, `partPayments[${index}].amount`);
  });

  const seen = new Set<string>();
  return needles.filter((needle) => {
    const key = `${needle.value.toLowerCase()}|${needle.label}`;
    if (needle.value.length < 2 || seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Finds needles in text, line by line.
 *
 * @param source - Name of the text's origin for reporting.
 * @param text - Text to search.
 * @param needles - Needles to look for.
 * @returns Hits, reported without the matched value.
 */
export function scanText(source: string, text: string, needles: Needle[]): Hit[] {
  const hits: Hit[] = [];
  const lines = text.split(/\r?\n/);

  lines.forEach((line, index) => {
    const lower = line.toLowerCase();
    needles.forEach((needle) => {
      if (containsToken(lower, needle.value.toLowerCase())) {
        hits.push({
          location: `${source}:${index + 1}`,
          label: needle.label,
          strong: needle.strong,
        });
      }
    });
  });

  return hits;
}

function containsToken(haystack: string, needle: string): boolean {
  let from = 0;

  for (;;) {
    const at = haystack.indexOf(needle, from);
    if (at === -1) {
      return false;
    }
    const before = haystack[at - 1] ?? '';
    const after = haystack[at + needle.length] ?? '';
    // Numbers must not be part of a longer number (e.g. "2025" inside "120250").
    const digitBoundary = !/\d/.test(needle[0] ?? '') || !/[\d.]/.test(before);
    const digitEnd = !/\d/.test(needle.at(-1) ?? '') || !/\d/.test(after);
    if (digitBoundary && digitEnd) {
      return true;
    }
    from = at + 1;
  }
}

function addText(needles: Needle[], value: string, label: string): void {
  needles.push({ value, label: `${label} (text)`, strong: value.length >= 5 });
}

function addAmount(needles: Needle[], amount: number, label: string): void {
  const integer = Math.round(amount);
  const raw = String(integer);
  const western = integer.toLocaleString('en-US');
  const indian = integer.toLocaleString('en-IN');
  const strong = raw.length >= 5;

  needles.push({ value: raw, label: `${label} (raw)`, strong });
  needles.push({ value: western.replace(/,/g, '_'), label: `${label} (underscore)`, strong });
  needles.push({ value: western, label: `${label} (western)`, strong });
  needles.push({ value: indian, label: `${label} (indian)`, strong });

  for (let power = 3; power <= 9; power += 1) {
    const scale = 10 ** power;
    if (integer % scale === 0 && integer >= scale) {
      const exponent = `${integer / scale}e${power}`;
      needles.push({ value: exponent, label: `${label} (minified)`, strong: exponent.length >= 5 });
    }
  }

  if (integer >= 100_000) {
    const lakhs = Number((integer / 100_000).toFixed(2));
    needles.push({ value: `₹${lakhs}L`, label: `${label} (lakh)`, strong: false });
  }
}

function addRate(needles: Needle[], rate: number, label: string): void {
  needles.push({ value: `${rate.toFixed(2)}%`, label: `${label} (percent)`, strong: true });
  needles.push({ value: String(rate), label: `${label} (raw)`, strong: false });
  needles.push({ value: rate.toFixed(2), label: `${label} (2dp)`, strong: false });
}

function addDate(needles: Needle[], iso: string, label: string): void {
  const [year = '', month = '', day = ''] = iso.split('-');
  const monthName = MONTHS[Number(month) - 1] ?? '';

  needles.push({ value: iso, label: `${label} (iso)`, strong: true });
  needles.push({ value: `${day} ${monthName} ${year}`, label: `${label} (display)`, strong: true });
  needles.push({
    value: `${Number(day)} ${monthName} ${year}`,
    label: `${label} (display)`,
    strong: true,
  });
  needles.push({ value: `${monthName} ${year}`, label: `${label} (month)`, strong: false });
}

async function loadProfile(file: string | undefined): Promise<LoanProfile> {
  const plainPath =
    file === undefined ? join(ROOT, '.private', 'set-a.json') : join(process.cwd(), file);

  if (existsSync(plainPath)) {
    return parseLoanProfile(JSON.parse(readFileSync(plainPath, 'utf8')));
  }

  const vaultPath = join(ROOT, 'src', 'vault', 'set-a.vault.json');
  if (!existsSync(vaultPath)) {
    throw new Error(
      'Need .private/set-a.json or src/vault/set-a.vault.json to know what to look for.',
    );
  }

  const passphrase = await readHidden('Passphrase for set a: ');
  return (await openBlob(JSON.parse(readFileSync(vaultPath, 'utf8')), passphrase)).profile;
}

function scanTree(needles: Needle[]): Hit[] {
  const files = git(['ls-files', '--cached', '--others', '--exclude-standard', '-z'])
    .split('\0')
    .filter((file) => file !== '' && existsSync(join(ROOT, file)));

  return files.flatMap((file) => scanFile(join(ROOT, file), needles));
}

function scanHistory(needles: Needle[]): Hit[] {
  const log = git(['log', '-p', '--all', '--reflog', '--no-color', '--format=commit %H']);
  return scanText('git-history', log, needles).map((hit) => ({
    ...hit,
    location: hit.location.replace('git-history', 'history(line)'),
  }));
}

function scanDist(needles: Needle[]): Hit[] {
  const dist = join(ROOT, 'dist');
  if (!existsSync(dist)) {
    throw new Error('dist/ not found; run "bun run build" first.');
  }
  return walk(dist).flatMap((file) => scanFile(file, needles));
}

async function scanUrl(site: string, needles: Needle[]): Promise<Hit[]> {
  const base = new URL(site.endsWith('/') ? site : `${site}/`);
  const queue = [base.href];
  const seen = new Set<string>();
  const hits: Hit[] = [];

  while (queue.length > 0) {
    const url = queue.shift() as string;
    if (seen.has(url)) {
      continue;
    }
    seen.add(url);

    const response = await fetch(url);
    if (!response.ok) {
      process.stdout.write(`warn: ${url} → HTTP ${response.status}\n`);
      continue;
    }

    const body = await response.text();
    hits.push(...scanText(url, body, needles));

    for (const match of body.matchAll(
      /["'(]((?:\.{0,2}\/)?[\w./-]*assets\/[\w.-]+\.(?:js|css|json))["')]/g,
    )) {
      const assetPath = match[1] ?? '';
      queue.push(new URL(assetPath.replace(/^\.?\//, ''), base).href);
    }
  }

  process.stdout.write(`Fetched ${seen.size} files from ${base.href}\n`);
  return hits;
}

function scanFile(path: string, needles: Needle[]): Hit[] {
  const buffer = readFileSync(path);
  if (buffer.includes(0)) {
    return [];
  }
  return scanText(relative(ROOT, path), buffer.toString('utf8'), needles);
}

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    return statSync(path).isDirectory() ? walk(path) : [path];
  });
}

function git(args: string[]): string {
  const result = spawnSync('git', args, {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 512 * 1024 * 1024,
  });
  if (result.status !== 0) {
    throw new Error(`git ${args[0]} failed: ${result.stderr}`);
  }
  return result.stdout;
}

async function main(argv: string[]): Promise<void> {
  const fileIndex = argv.indexOf('--file');
  const urlIndex = argv.indexOf('--url');
  const file = fileIndex === -1 ? undefined : argv[fileIndex + 1];
  const url = urlIndex === -1 ? undefined : argv[urlIndex + 1];
  const targets = {
    tree: argv.includes('--tree'),
    history: argv.includes('--history'),
    dist: argv.includes('--dist'),
  };

  if (!targets.tree && !targets.history && !targets.dist && url === undefined) {
    targets.tree = true;
  }

  const needles = buildNeedles(await loadProfile(file));
  process.stdout.write(`Searching with ${needles.length} needles (values hidden).\n`);

  const hits = [
    ...(targets.tree ? scanTree(needles) : []),
    ...(targets.history ? scanHistory(needles) : []),
    ...(targets.dist ? scanDist(needles) : []),
    ...(url === undefined ? [] : await scanUrl(url, needles)),
  ];
  const strong = hits.filter((hit) => hit.strong);
  const weak = hits.filter((hit) => !hit.strong);

  strong.forEach((hit) => process.stdout.write(`LEAK  ${hit.location} — ${hit.label}\n`));
  weak.forEach((hit) => process.stdout.write(`check ${hit.location} — ${hit.label}\n`));
  process.stdout.write(
    `\n${strong.length} strong match(es), ${weak.length} low-confidence match(es) to review by eye.\n`,
  );
  process.exitCode = strong.length > 0 ? 1 : 0;
}

if (import.meta.main) {
  main(process.argv.slice(2)).catch((error: unknown) => {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(2);
  });
}
