import { beforeEach, describe, expect, test } from 'vitest';

import {
  ACTIVE_STORAGE_KEY,
  createEmptyScenario,
  loadActiveDataset,
  loadMyLoanBlob,
  loadSample,
  MY_LOAN_STORAGE_KEY,
  resetStoredData,
  saveMyLoanBlob,
  saveSample,
  scenarioColors,
} from '../../src/app/storage';
import { sampleLoan } from '../../src/config/sampleLoan';
import type { VaultBlob } from '../../src/features/vault/vaultCrypto';

beforeEach(() => {
  window.localStorage.clear();
});

describe('sample storage', () => {
  test('keeps edited terms and refuses an invalid stored profile', () => {
    const edited = { ...sampleLoan, loan: { ...sampleLoan.loan, principal: 3_000_000 } };
    saveSample(edited);
    expect(loadSample()).toEqual(edited);

    window.localStorage.setItem(
      'paydown:sample:v3',
      JSON.stringify({ ...edited, loan: { ...edited.loan, principal: -5 } }),
    );
    expect(loadSample()).toEqual(sampleLoan);
  });

  test('moves events stored by the older version onto the sample terms', () => {
    const parts = [{ date: '2024-05-01', amount: 50_000 }];
    window.localStorage.setItem(
      'paydown:sample:v2',
      JSON.stringify({ rateChanges: [], partPayments: parts, scenarios: [] }),
    );

    const loaded = loadSample();
    expect(loaded.loan.principal).toBe(sampleLoan.loan.principal);
    expect(loaded.loan.partPayments).toEqual(parts);
    expect(loaded.loan.rateChanges).toEqual([]);
    expect(window.localStorage.getItem('paydown:sample:v2')).toBeNull();
  });

  test('restoring the sample never touches your own loan', () => {
    const blob = {
      v: 2,
      kdf: { name: 'PBKDF2-SHA256', iterations: 1_000_000, salt: 'c2FsdA==' },
      wrap: { iv: 'aXY=', ct: 'Y3Q=' },
      data: { iv: 'aXY=', ct: 'Y3Q=' },
    } satisfies VaultBlob;
    saveMyLoanBlob(blob);
    saveSample(sampleLoan);

    resetStoredData();

    expect(window.localStorage.getItem('paydown:sample:v3')).toBeNull();
    expect(loadMyLoanBlob()).toEqual(blob);
  });

  test('reads only a well-formed blob back', () => {
    window.localStorage.setItem(MY_LOAN_STORAGE_KEY, JSON.stringify({ loan: sampleLoan.loan }));
    expect(loadMyLoanBlob()).toBeUndefined();
  });

  test('moves the older set a hint to the active loan', () => {
    window.localStorage.setItem('paydown:remembered:v1', '1');

    expect(loadActiveDataset()).toBe('set-a');
    expect(window.localStorage.getItem('paydown:remembered:v1')).toBeNull();
    expect(window.localStorage.getItem(ACTIVE_STORAGE_KEY)).toBe('set-a');
  });
});

describe('what-if scenario creation', () => {
  test('never reuses a name or colour that is still in use', () => {
    const a = createEmptyScenario([]);
    const b = createEmptyScenario([a]);
    const c = createEmptyScenario([a, b]);

    // Delete A, then add another: it must not become a second "Scenario C".
    const next = createEmptyScenario([b, c]);

    expect([a.name, b.name, c.name]).toEqual(['Scenario A', 'Scenario B', 'Scenario C']);
    expect(next.name).toBe('Scenario A');
    expect(next.color).toBe(scenarioColors[0]);
    expect(new Set([b.color, c.color, next.color]).size).toBe(3);
  });

  test('can start with events', () => {
    const scenario = createEmptyScenario([], {
      rateChanges: [],
      partPayments: [{ date: '2026-11-01', amount: 100_000 }],
    });

    expect(scenario.partPayments).toHaveLength(1);
  });
});
