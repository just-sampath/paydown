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

export const scenarioColors = ['#B8A3F0', '#E89568', '#FFE15A', '#B5C77A', '#4EA5FF'];

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
 * Clears all persisted app data owned by this dashboard, including legacy keys.
 *
 * @returns Nothing.
 */
export function resetStoredData(): void {
  window.localStorage.removeItem(SAMPLE_STORAGE_KEY);
  window.localStorage.removeItem(PREFS_STORAGE_KEY);
  clearLegacyData();
}

/**
 * Creates a new empty what-if scenario.
 *
 * @param index - Zero-based scenario index used for name and color selection.
 * @returns Scenario with no hypothetical events.
 */
export function createEmptyScenario(index: number): WhatIfScenario {
  const color = scenarioColors[index % scenarioColors.length] ?? '#B8A3F0';

  return {
    id: window.crypto.randomUUID(),
    name: `Scenario ${String.fromCharCode(65 + index)}`,
    color,
    rateChanges: [],
    partPayments: [],
  };
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
