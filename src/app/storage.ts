import type { PartPayment, RateChange } from '../features/loan/loanEngine';
import type { WhatIfScenario } from '../features/vault/loanProfile';

export type { WhatIfScenario } from '../features/vault/loanProfile';

export type ThemeMode = 'light' | 'dark';
export type PaletteName = 'default' | 'carbon' | 'cocoa';

export type UserLoanData = {
  rateChanges: RateChange[];
  partPayments: PartPayment[];
  scenarios: WhatIfScenario[];
};

export type AppearancePrefs = {
  theme: ThemeMode;
  palette: PaletteName;
};

const SAMPLE_STORAGE_KEY = 'paydown:sample:v2';
const PREFS_STORAGE_KEY = 'paydown:prefs:v1';
/** Pre-vault key that held real loan events in plaintext. Removed on every start. */
export const LEGACY_DATA_STORAGE_KEY = 'paydown:data:v1';

/** Mid-tone scenario colours that stay visible on both light and dark surfaces. */
export const scenarioColors = ['#8B6FE0', '#E07A45', '#2E9E8F', '#C99A00', '#3D8BE0'];

/**
 * Reads the visitor's edits to the sample loan from localStorage.
 *
 * @param fallback - Sample data to use when storage is empty or invalid.
 * @returns Stored sample edits or the supplied fallback.
 */
export function loadSampleEdits(fallback: UserLoanData): UserLoanData {
  return readJson(SAMPLE_STORAGE_KEY, fallback);
}

/**
 * Persists edits to the sample loan. Unlocked data sets are never written here.
 *
 * @param data - Rate changes, part payments, and what-if scenarios to store.
 * @returns Nothing.
 */
export function saveSampleEdits(data: UserLoanData): void {
  window.localStorage.setItem(SAMPLE_STORAGE_KEY, JSON.stringify(data));
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
 * the data is about the loan, not about how the app looks.
 *
 * @returns Nothing.
 */
export function resetStoredData(): void {
  window.localStorage.removeItem(SAMPLE_STORAGE_KEY);
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
  const rawValue = window.localStorage.getItem(key);

  if (rawValue === null) {
    return fallback;
  }

  try {
    return JSON.parse(rawValue) as T;
  } catch {
    return fallback;
  }
}
