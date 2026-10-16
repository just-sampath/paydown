import {
  createSchedule,
  validateLoanConfig,
  type LoanConfig,
  type PartPayment,
  type RateChange,
} from '../loan/loanEngine';

export type WhatIfScenario = {
  id: string;
  name: string;
  color: string;
  rateChanges: RateChange[];
  partPayments: PartPayment[];
};

export type LoanMeta = {
  name: string;
  lender: string;
  rateType: 'floating';
};

/**
 * A complete, self-describing loan: base terms, recorded events, and what-if scenarios.
 * This is the plaintext shape that the vault encrypts.
 */
export type LoanProfile = {
  schema: 1;
  meta: LoanMeta;
  loan: LoanConfig;
  scenarios: WhatIfScenario[];
};

export class LoanProfileError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'LoanProfileError';
  }
}

/**
 * Validates untrusted input as a loan profile.
 *
 * Checks the shape field by field, runs the engine validator, and dry-runs the
 * schedule so a profile that cannot amortize is rejected before any app state changes.
 *
 * @param input - Parsed JSON of unknown shape.
 * @returns A new, normalized loan profile containing only known fields.
 */
export function parseLoanProfile(input: unknown): LoanProfile {
  const root = requireRecord(input, 'profile');

  if (root.schema !== 1) {
    throw new LoanProfileError('profile.schema must be 1');
  }

  const meta = requireRecord(root.meta, 'meta');
  const loan = requireRecord(root.loan, 'loan');
  const profile: LoanProfile = {
    schema: 1,
    meta: {
      name: requireString(meta.name, 'meta.name'),
      lender: requireString(meta.lender, 'meta.lender'),
      rateType: requireLiteral(meta.rateType, 'floating', 'meta.rateType'),
    },
    loan: {
      principal: requireNumber(loan.principal, 'loan.principal'),
      originalRate: requireNumber(loan.originalRate, 'loan.originalRate'),
      tenureMonths: requireNumber(loan.tenureMonths, 'loan.tenureMonths'),
      startDate: requireString(loan.startDate, 'loan.startDate'),
      ...(loan.preEmiInterest === undefined
        ? {}
        : { preEmiInterest: requireNumber(loan.preEmiInterest, 'loan.preEmiInterest') }),
      rateChanges: parseRateChanges(loan.rateChanges, 'loan.rateChanges'),
      partPayments: parsePartPayments(loan.partPayments, 'loan.partPayments'),
    },
    scenarios: requireArray(root.scenarios, 'scenarios').map((item, index) =>
      parseScenario(item, `scenarios[${index}]`),
    ),
  };

  try {
    validateLoanConfig(profile.loan);
    createSchedule(profile.loan);
  } catch (error) {
    throw new LoanProfileError(`loan is invalid: ${(error as Error).message}`);
  }

  return profile;
}

function parseScenario(input: unknown, path: string): WhatIfScenario {
  const scenario = requireRecord(input, path);

  return {
    id: requireString(scenario.id, `${path}.id`),
    name: requireString(scenario.name, `${path}.name`),
    color: requireString(scenario.color, `${path}.color`),
    rateChanges: parseRateChanges(scenario.rateChanges, `${path}.rateChanges`),
    partPayments: parsePartPayments(scenario.partPayments, `${path}.partPayments`),
  };
}

function parseRateChanges(input: unknown, path: string): RateChange[] {
  return requireArray(input, path).map((item, index) => {
    const event = requireRecord(item, `${path}[${index}]`);
    return {
      date: requireString(event.date, `${path}[${index}].date`),
      rate: requireNumber(event.rate, `${path}[${index}].rate`),
    };
  });
}

function parsePartPayments(input: unknown, path: string): PartPayment[] {
  return requireArray(input, path).map((item, index) => {
    const event = requireRecord(item, `${path}[${index}]`);
    return {
      date: requireString(event.date, `${path}[${index}].date`),
      amount: requireNumber(event.amount, `${path}[${index}].amount`),
    };
  });
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    throw new LoanProfileError(`${path} must be an object`);
  }

  return value as Record<string, unknown>;
}

function requireArray(value: unknown, path: string): unknown[] {
  if (!Array.isArray(value)) {
    throw new LoanProfileError(`${path} must be an array`);
  }

  return value;
}

function requireString(value: unknown, path: string): string {
  if (typeof value !== 'string' || value.length === 0) {
    throw new LoanProfileError(`${path} must be a non-empty string`);
  }

  return value;
}

function requireNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new LoanProfileError(`${path} must be a finite number`);
  }

  return value;
}

function requireLiteral<T extends string>(value: unknown, literal: T, path: string): T {
  if (value !== literal) {
    throw new LoanProfileError(`${path} must be "${literal}"`);
  }

  return literal;
}
