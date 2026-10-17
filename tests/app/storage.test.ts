import { describe, expect, test } from 'vitest';

import { createEmptyScenario, scenarioColors } from '../../src/app/storage';

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
