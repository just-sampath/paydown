import { sampleLoan } from '../config/sampleLoan';
import {
  parseLoanProfile,
  type LoanProfile,
  type WhatIfScenario,
} from '../features/vault/loanProfile';
import { parseVaultBlob, type VaultBlob } from '../features/vault/vaultCrypto';

export type { WhatIfScenario } from '../features/vault/loanProfile';

export type ThemeMode = 'light' | 'dark';
export type PaletteName = 'default' | 'carbon' | 'cocoa';

export type AppearancePrefs = {
  theme: ThemeMode;
  palette: PaletteName;
};

/** Which loan the app shows. "mine" is the visitor's own loan, kept encrypted on the device. */
export type DatasetId = 'sample' | 'set-a' | 'mine';

const SAMPLE_STORAGE_KEY = 'paydown:sample:v3';
/** Held only the sample's events, on the fixed sample terms. Migrated to v3, then removed. */
const SAMPLE_V2_STORAGE_KEY = 'paydown:sample:v2';
const PREFS_STORAGE_KEY = 'paydown:prefs:v1';
/** Ciphertext only: a vault blob, never the loan itself. */
export const MY_LOAN_STORAGE_KEY = 'paydown:mine:v1';
/** Non-secret hint for boot: which loan was showing, so a remembered one can open at once. */
export const ACTIVE_STORAGE_KEY = 'paydown:active:v1';
/** Older hint that set a had a remembered key. Migrated to the active key, then removed. */
const REMEMBERED_STORAGE_KEY = 'paydown:remembered:v1';
/** Pre-vault key that held real loan events in plaintext. Removed on every start. */
export const LEGACY_DATA_STORAGE_KEY = 'paydown:data:v1';

/** Mid-tone scenario colours that stay visible on both light and dark surfaces. */
export const scenarioColors = ['#8B6FE0', '#E07A45', '#2E9E8F', '#C99A00', '#3D8BE0'];

/**
 * Reads the sample loan, with the visitor's edits, from localStorage. Anything stored is
 * validated as a whole profile. Older storage that held only events is moved onto the
 * sample terms.
 *
 * @returns The stored sample, or the built-in sample when storage is empty or invalid.
 */
export function loadSample(): LoanProfile {
  const stored = readJson<unknown>(SAMPLE_STORAGE_KEY, undefined);

  if (stored !== undefined) {
    return tryParseProfile(stored) ?? sampleLoan;
  }

  const older = readJson<Record<string, unknown> | undefined>(SAMPLE_V2_STORAGE_KEY, undefined);
  removeItem(SAMPLE_V2_STORAGE_KEY);

  if (typeof older !== 'object' || older === null) {
    return sampleLoan;
  }

  return (
    tryParseProfile({
      ...sampleLoan,
      loan: {
        ...sampleLoan.loan,
        rateChanges: older.rateChanges,
        partPayments: older.partPayments,
      },
      scenarios: older.scenarios,
    }) ?? sampleLoan
  );
}

/**
 * Persists the sample loan with the visitor's edits. Other loans are never written here.
 *
 * @param profile - The edited sample.
 * @returns Nothing.
 */
export function saveSample(profile: LoanProfile): void {
  window.localStorage.setItem(SAMPLE_STORAGE_KEY, JSON.stringify(profile));
}

/**
 * Reads the encrypted blob of the visitor's own loan.
 *
 * @returns The checked blob, or `undefined` when there is none or it is unreadable.
 */
export function loadMyLoanBlob(): VaultBlob | undefined {
  const stored = readJson<unknown>(MY_LOAN_STORAGE_KEY, undefined);

  if (stored === undefined) {
    return undefined;
  }

  try {
    return parseVaultBlob(stored);
  } catch {
    return undefined;
  }
}

/**
 * Stores the encrypted blob of the visitor's own loan.
 *
 * @param blob - Vault blob; the loan itself is never stored.
 * @returns Nothing.
 */
export function saveMyLoanBlob(blob: VaultBlob): void {
  window.localStorage.setItem(MY_LOAN_STORAGE_KEY, JSON.stringify(blob));
}

/**
 * Deletes the visitor's own loan from this device.
 *
 * @returns Nothing.
 */
export function clearMyLoanBlob(): void {
  removeItem(MY_LOAN_STORAGE_KEY);
}

/**
 * Reads which loan was showing last. Migrates the older set a hint.
 *
 * @returns The last active loan, or `'sample'`.
 */
export function loadActiveDataset(): DatasetId {
  try {
    const stored = window.localStorage.getItem(ACTIVE_STORAGE_KEY);

    if (window.localStorage.getItem(REMEMBERED_STORAGE_KEY) === '1' && stored === null) {
      saveActiveDataset('set-a');
    }
    removeItem(REMEMBERED_STORAGE_KEY);

    const value = window.localStorage.getItem(ACTIVE_STORAGE_KEY);
    return value === 'set-a' || value === 'mine' ? value : 'sample';
  } catch {
    return 'sample';
  }
}

/**
 * Records which loan is showing, so the next visit can open it.
 *
 * @param dataset - Loan now showing.
 * @returns Nothing.
 */
export function saveActiveDataset(dataset: DatasetId): void {
  try {
    if (dataset === 'sample') {
      window.localStorage.removeItem(ACTIVE_STORAGE_KEY);
    } else {
      window.localStorage.setItem(ACTIVE_STORAGE_KEY, dataset);
    }
  } catch {
    // Storage blocked: the next visit just starts on the sample.
  }
}

/**
 * Deletes the pre-vault plaintext loan data left behind by older versions.
 *
 * @returns Nothing.
 */
export function clearLegacyData(): void {
  window.localStorage.removeItem(LEGACY_DATA_STORAGE_KEY);
}

/**
 * Reads persisted theme and palette preferences.
 *
 * @param fallback - Default preferences to use when storage is empty or invalid.
 * @returns Stored appearance preferences or the supplied fallback.
 */
export function loadAppearancePrefs(fallback: AppearancePrefs): AppearancePrefs {
  return readJson(PREFS_STORAGE_KEY, fallback);
}

/**
 * Persists theme and palette preferences to localStorage.
 *
 * @param prefs - Appearance preferences to store.
 * @returns Nothing.
 */
export function saveAppearancePrefs(prefs: AppearancePrefs): void {
  window.localStorage.setItem(PREFS_STORAGE_KEY, JSON.stringify(prefs));
}

/**
 * Clears the stored sample edits and legacy keys. Theme and palette are kept: restoring
 * the data is about the loan, not about how the app looks. The visitor's own loan is
 * never touched here.
 *
 * @returns Nothing.
 */
export function resetStoredData(): void {
  removeItem(SAMPLE_STORAGE_KEY);
  removeItem(SAMPLE_V2_STORAGE_KEY);
  clearLegacyData();
}

/**
 * Creates a new empty what-if scenario with a name and colour no other scenario uses.
 *
 * @param existing - Scenarios that already exist.
 * @param events - Optional starting events for the scenario.
 * @returns Scenario ready to append to the list.
 */
export function createEmptyScenario(
  existing: WhatIfScenario[],
  events: Pick<WhatIfScenario, 'rateChanges' | 'partPayments'> = {
    rateChanges: [],
    partPayments: [],
  },
): WhatIfScenario {
  const usedNames = new Set(existing.map((scenario) => scenario.name));
  const usedColors = new Set(existing.map((scenario) => scenario.color.toLowerCase()));
  const color =
    scenarioColors.find((item) => !usedColors.has(item.toLowerCase())) ??
    scenarioColors[existing.length % scenarioColors.length] ??
    '#B8A3F0';

  return {
    id: window.crypto.randomUUID(),
    name: nextScenarioName(usedNames),
    color,
    ...events,
  };
}

function nextScenarioName(usedNames: Set<string>): string {
  for (let index = 0; ; index += 1) {
    const letters = scenarioLetters(index);
    const name = `Scenario ${letters}`;

    if (!usedNames.has(name)) {
      return name;
    }
  }
}

function scenarioLetters(index: number): string {
  const letter = String.fromCharCode(65 + (index % 26));
  return index < 26 ? letter : `${letter}${Math.floor(index / 26)}`;
}

function readJson<T>(key: string, fallback: T): T {
  let rawValue: string | null;

  try {
    rawValue = window.localStorage.getItem(key);
  } catch {
    return fallback;
  }

  if (rawValue === null) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}

function removeItem(key: string): void {
  try {
    window.localStorage.removeItem(key);
  } catch {
    // Storage blocked: there is nothing stored to remove.
  }
}

function tryParseProfile(input: unknown): LoanProfile | undefined {
  try {
    return parseLoanProfile(input);
  } catch {
    return undefined;
  }
}
