export type RateChange = {
  date: string;
  rate: number;
};

export type PartPayment = {
  date: string;
  amount: number;
};

export type LoanConfig = {
  principal: number;
  originalRate: number;
  tenureMonths: number;
  startDate: string;
  preEmiInterest?: number;
  rateChanges: RateChange[];
  partPayments: PartPayment[];
};

export type ScheduleRow = {
  index: number;
  date: string;
  rate: number;
  openingBalance: number;
  interest: number;
  principal: number;
  emi: number;
  prepayment: number;
  simpleInterest: number;
  closingBalance: number;
  rateChanged: boolean;
  newRate: number | null;
};

export type ScheduleSummary = {
  totalMonths: number;
  totalInterest: number;
  scheduledInterest: number;
  totalPrincipal: number;
  principalFromEmi: number;
  totalPrepayment: number;
  totalEmiPaid: number;
  totalOutflow: number;
  totalSimpleInterest: number;
  preEmiInterest: number;
  baseEmi: number;
  payoffDate: string;
};

export type LoanSchedule = {
  rows: ScheduleRow[];
  summary: ScheduleSummary;
};

export type EventImpact = {
  date: string;
  monthsSaved: number;
  interestSaved: number;
};

export type RateImpact = EventImpact & RateChange;
export type PartPaymentImpact = EventImpact &
  PartPayment & {
    simpleInterest: number;
  };

export type YearlyAggregate = {
  year: number;
  principal: number;
  interest: number;
  prepayment: number;
  emi: number;
  count: number;
  endBalance: number;
};

export type LoanAnalysis = {
  original: LoanSchedule;
  actual: LoanSchedule;
  asOfDate: string;
  todayIndex: number;
  monthsSaved: number;
  interestSaved: number;
  paidPrincipal: number;
  paidInterest: number;
  paidEmi: number;
  paidPrepayment: number;
  outstanding: number;
  nextRow: ScheduleRow | undefined;
  remainingPaymentCount: number;
  remainingScheduledPayments: number;
  remainingInterest: number;
  completedRows: ScheduleRow[];
  rateCategoryImpact: EventImpact;
  partPaymentCategoryImpact: EventImpact;
  rateImpacts: RateImpact[];
  partPaymentImpacts: PartPaymentImpact[];
  yearlyActual: YearlyAggregate[];
  yearlyOriginal: YearlyAggregate[];
};

type DateParts = {
  year: number;
  month: number;
  day: number;
};

type NormalizedRateChange = RateChange & {
  effectiveMonth: number;
};

type LoanEvent =
  | {
      kind: 'rate';
      sourceIndex: number;
      effectiveMonth: number;
      date: string;
      rate: number;
    }
  | {
      kind: 'partPayment';
      sourceIndex: number;
      effectiveMonth: number;
      date: string;
      amount: number;
    };

const RATE_EVENT_ORDER = 0;
const PART_PAYMENT_EVENT_ORDER = 1;
const DEFAULT_EPSILON = 0.005;

/**
 * Calculates the fixed monthly EMI for a reducing-balance loan.
 *
 * @param principal - Original principal amount in rupees.
 * @param annualRatePercent - Annual interest rate as a percentage, for example `9.15`.
 * @param tenureMonths - Loan tenure in whole months.
 * @returns Fixed monthly EMI in rupees, kept unrounded for downstream calculations.
 */
export function calculateEmi(
  principal: number,
  annualRatePercent: number,
  tenureMonths: number,
): number {
  validatePositiveNumber(principal, 'principal');
  validatePositiveInteger(tenureMonths, 'tenureMonths');

  if (annualRatePercent === 0) {
    return principal / tenureMonths;
  }

  const monthlyRate = annualRatePercent / 12 / 100;
  const growthFactor = (1 + monthlyRate) ** tenureMonths;

  return (principal * monthlyRate * growthFactor) / (growthFactor - 1);
}

/**
 * Converts an event date into the schedule month where it takes effect.
 *
 * @param date - ISO date string in `YYYY-MM-DD` format.
 * @param startDate - Loan start date in `YYYY-MM-DD` format.
 * @param eventKind - `rate` rolls mid-month events to the next month; `partPayment` applies in its calendar month.
 * @returns One-based month index relative to the start month.
 */
export function getEffectiveMonthIndex(
  date: string,
  startDate: string,
  eventKind: 'rate' | 'partPayment',
): number {
  const eventDate = parseIsoDate(date);
  const start = parseIsoDate(startDate);
  const monthOffset = (eventDate.year - start.year) * 12 + (eventDate.month - start.month);
  const rateRollForward = eventKind === 'rate' && eventDate.day > 1 ? 1 : 0;
  const effectiveMonth = monthOffset + 1 + rateRollForward;

  if (effectiveMonth < 1) {
    throw new Error(`Event date ${date} occurs before loan start ${startDate}`);
  }

  return effectiveMonth;
}

/**
 * Builds the month-by-month amortization schedule using fixed EMI and tenure reduction.
 *
 * @param config - Loan configuration with principal, original rate, tenure, start date, rate changes, and part payments.
 * @returns Schedule rows and aggregate totals for the supplied loan configuration.
 */
export function createSchedule(config: LoanConfig): LoanSchedule {
  validateLoanConfig(config);

  const baseEmi = calculateEmi(config.principal, config.originalRate, config.tenureMonths);
  const rateChanges = normalizeRateChanges(config);
  const prepaymentsByMonth = groupPartPayments(config);
  const rows = buildScheduleRows(config, rateChanges, prepaymentsByMonth, baseEmi);

  return {
    rows,
    summary: summarizeSchedule(rows, baseEmi, config.preEmiInterest ?? 0),
  };
}

/**
 * Builds complete dashboard-ready loan analysis against an original no-event plan.
 *
 * @param config - Loan configuration with current rate changes and part payments.
 * @param today - ISO date string used to determine completed rows and the next EMI.
 * @returns Original and actual schedules, paid-to-date totals, event impacts, yearly aggregates, and savings totals.
 */
export function buildLoanAnalysis(config: LoanConfig, today: string): LoanAnalysis {
  parseIsoDate(today);
  const original = createSchedule({ ...config, rateChanges: [], partPayments: [] });
  const actual = createSchedule(config);
  const withoutRates = createSchedule({ ...config, rateChanges: [] });
  const withoutPrepayments = createSchedule({ ...config, partPayments: [] });
  const completedRows = actual.rows.filter((row) => row.date < today);
  const remainingRows = actual.rows.filter((row) => row.date >= today);
  const todayIndex = completedRows.at(-1)?.index ?? 0;
  const paidTotals = totalCompletedRows(completedRows);
  const impacts = calculateEventImpacts(config);

  return {
    original,
    actual,
    asOfDate: today,
    todayIndex,
    monthsSaved: original.summary.totalMonths - actual.summary.totalMonths,
    interestSaved: original.summary.totalInterest - actual.summary.totalInterest,
    paidPrincipal: paidTotals.principal,
    paidInterest: paidTotals.interest,
    paidEmi: paidTotals.emi,
    paidPrepayment: paidTotals.prepayment,
    outstanding: completedRows.at(-1)?.closingBalance ?? config.principal,
    nextRow: remainingRows[0],
    remainingPaymentCount: remainingRows.length,
    remainingScheduledPayments: remainingRows.reduce(
      (sum, row) => sum + row.emi + row.prepayment + row.simpleInterest,
      0,
    ),
    remainingInterest: remainingRows.reduce(
      (sum, row) => sum + row.interest + row.simpleInterest,
      0,
    ),
    completedRows,
    rateCategoryImpact: compareSchedules(withoutRates, actual),
    partPaymentCategoryImpact: compareSchedules(withoutPrepayments, actual),
    rateImpacts: impacts.rateImpacts,
    partPaymentImpacts: impacts.partPaymentImpacts,
    yearlyActual: createYearlyAggregates(actual.rows),
    yearlyOriginal: createYearlyAggregates(original.rows),
  };
}

function buildScheduleRows(
  config: LoanConfig,
  rateChanges: Map<number, NormalizedRateChange>,
  prepaymentsByMonth: Map<number, PartPayment[]>,
  baseEmi: number,
): ScheduleRow[] {
  const rows: ScheduleRow[] = [];
  let balance = config.principal;
  let currentRate = config.originalRate;
  const maxMonths = Math.max(config.tenureMonths * 4, config.tenureMonths + 600);

  for (let index = 1; index <= maxMonths && balance > DEFAULT_EPSILON; index += 1) {
    const rateChange = rateChanges.get(index);
    currentRate = rateChange?.rate ?? currentRate;
    const row = createScheduleRow({
      index,
      balance,
      rate: currentRate,
      baseEmi,
      prepayments: prepaymentsByMonth.get(index) ?? [],
      date: emiDateFromIndex(config.startDate, index),
      rateChange,
    });

    rows.push(row);
    balance = row.closingBalance;
  }

  if (balance > DEFAULT_EPSILON) {
    throw new Error('Loan did not amortize within the safety limit');
  }

  return rows;
}

function createScheduleRow(input: {
  index: number;
  date: string;
  balance: number;
  rate: number;
  baseEmi: number;
  prepayments: PartPayment[];
  rateChange: NormalizedRateChange | undefined;
}): ScheduleRow {
  const openingBalance = input.balance;
  const interest = openingBalance * (input.rate / 12 / 100);
  const maximumPayment = openingBalance + interest;
  const emi = Math.min(input.baseEmi, maximumPayment);
  const principal = Math.min(openingBalance, Math.max(0, emi - interest));
  const balanceAfterEmi = Math.max(0, openingBalance - principal);
  const totalPrepaymentAmount = input.prepayments.reduce((sum, payment) => sum + payment.amount, 0);
  const prepayment = Math.min(totalPrepaymentAmount, balanceAfterEmi);
  const simpleInterest = input.prepayments.reduce(
    (sum, payment) => sum + computeSimpleInterest(payment, input.rate),
    0,
  );
  const closingBalance = Math.max(0, balanceAfterEmi - prepayment);

  if (principal <= 0 && prepayment <= 0 && closingBalance > DEFAULT_EPSILON) {
    throw new Error('EMI is not high enough to cover monthly interest');
  }

  return {
    index: input.index,
    date: input.date,
    rate: input.rate,
    openingBalance,
    interest,
    principal,
    emi,
    prepayment,
    simpleInterest,
    closingBalance,
    rateChanged: input.rateChange !== undefined,
    newRate: input.rateChange?.rate ?? null,
  };
}

/**
 * Computes the simple interest the lender charges on a mid-month prepayment: interest on
 * the prepaid amount from the day after the EMI (day 2) to the day before the
 * prepayment (day d-1), i.e. `max(0, day - 2)` days at the current annual rate.
 */
function computeSimpleInterest(prepayment: PartPayment, annualRate: number): number {
  const { year, day } = parseIsoDate(prepayment.date);
  const accrualDays = Math.max(0, day - 2);

  if (accrualDays === 0) {
    return 0;
  }

  const daysInYear = isLeapYear(year) ? 366 : 365;

  return (prepayment.amount * (annualRate / 100) * accrualDays) / daysInYear;
}

function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

function summarizeSchedule(
  rows: ScheduleRow[],
  baseEmi: number,
  preEmiInterest: number,
): ScheduleSummary {
  const totals = rows.reduce(
    (sum, row) => ({
      interest: sum.interest + row.interest,
      simpleInterest: sum.simpleInterest + row.simpleInterest,
      principal: sum.principal + row.principal,
      prepayment: sum.prepayment + row.prepayment,
      emi: sum.emi + row.emi,
    }),
    { interest: 0, simpleInterest: 0, principal: 0, prepayment: 0, emi: 0 },
  );
  const payoffDate = rows.at(-1)?.date ?? '';
  const totalPrincipal = totals.principal + totals.prepayment;

  return {
    totalMonths: rows.length,
    totalInterest: totals.interest + totals.simpleInterest + preEmiInterest,
    scheduledInterest: totals.interest,
    totalPrincipal,
    principalFromEmi: totals.principal,
    totalPrepayment: totals.prepayment,
    totalEmiPaid: totals.emi,
    totalOutflow: totals.emi + totals.prepayment + totals.simpleInterest + preEmiInterest,
    totalSimpleInterest: totals.simpleInterest,
    preEmiInterest,
    baseEmi,
    payoffDate,
  };
}

function calculateEventImpacts(config: LoanConfig): {
  rateImpacts: RateImpact[];
  partPaymentImpacts: PartPaymentImpact[];
} {
  const events = buildEventTimeline(config);
  const rateImpacts: RateImpact[] = [];
  const partPaymentImpacts: PartPaymentImpact[] = [];

  events.forEach((event, index) => {
    const before = createSchedule(configWithEvents(config, events.slice(0, index)));
    const after = createSchedule(configWithEvents(config, events.slice(0, index + 1)));
    const impact = {
      date: event.date,
      monthsSaved: before.summary.totalMonths - after.summary.totalMonths,
      interestSaved: before.summary.totalInterest - after.summary.totalInterest,
    };

    if (event.kind === 'rate') {
      rateImpacts[event.sourceIndex] = { ...impact, date: event.date, rate: event.rate };
    } else {
      const row = after.rows[event.effectiveMonth - 1];
      partPaymentImpacts[event.sourceIndex] = {
        ...impact,
        date: event.date,
        amount: event.amount,
        simpleInterest: computeSimpleInterest(event, row?.rate ?? config.originalRate),
      };
    }
  });

  return { rateImpacts, partPaymentImpacts };
}

function compareSchedules(before: LoanSchedule, after: LoanSchedule): EventImpact {
  return {
    date: after.rows[0]?.date ?? '',
    monthsSaved: before.summary.totalMonths - after.summary.totalMonths,
    interestSaved: before.summary.totalInterest - after.summary.totalInterest,
  };
}

function buildEventTimeline(config: LoanConfig): LoanEvent[] {
  const rateEvents = config.rateChanges.map<LoanEvent>((event, sourceIndex) => ({
    kind: 'rate',
    sourceIndex,
    effectiveMonth: getEffectiveMonthIndex(event.date, config.startDate, 'rate'),
    date: event.date,
    rate: event.rate,
  }));
  const partPaymentEvents = config.partPayments.map<LoanEvent>((event, sourceIndex) => ({
    kind: 'partPayment',
    sourceIndex,
    effectiveMonth: getEffectiveMonthIndex(event.date, config.startDate, 'partPayment'),
    date: event.date,
    amount: event.amount,
  }));

  return [...rateEvents, ...partPaymentEvents].sort(compareLoanEvents);
}

function compareLoanEvents(left: LoanEvent, right: LoanEvent): number {
  return (
    left.effectiveMonth - right.effectiveMonth ||
    eventOrder(left) - eventOrder(right) ||
    left.date.localeCompare(right.date)
  );
}

function eventOrder(event: LoanEvent): number {
  return event.kind === 'rate' ? RATE_EVENT_ORDER : PART_PAYMENT_EVENT_ORDER;
}

function configWithEvents(config: LoanConfig, events: LoanEvent[]): LoanConfig {
  return {
    ...config,
    rateChanges: events.flatMap((event) =>
      event.kind === 'rate' ? [{ date: event.date, rate: event.rate }] : [],
    ),
    partPayments: events.flatMap((event) =>
      event.kind === 'partPayment' ? [{ date: event.date, amount: event.amount }] : [],
    ),
  };
}

function normalizeRateChanges(config: LoanConfig): Map<number, NormalizedRateChange> {
  const sortedChanges = config.rateChanges
    .map((event) => ({
      ...event,
      effectiveMonth: getEffectiveMonthIndex(event.date, config.startDate, 'rate'),
    }))
    .sort(
      (left, right) =>
        left.effectiveMonth - right.effectiveMonth || left.date.localeCompare(right.date),
    );

  return new Map(sortedChanges.map((event) => [event.effectiveMonth, event]));
}

function groupPartPayments(config: LoanConfig): Map<number, PartPayment[]> {
  return config.partPayments.reduce((groups, event) => {
    const effectiveMonth = getEffectiveMonthIndex(event.date, config.startDate, 'partPayment');
    const list = groups.get(effectiveMonth) ?? [];
    list.push(event);
    groups.set(effectiveMonth, list);
    return groups;
  }, new Map<number, PartPayment[]>());
}

function createYearlyAggregates(rows: ScheduleRow[]): YearlyAggregate[] {
  const yearly = rows.reduce((groups, row) => {
    const year = parseIsoDate(row.date).year;
    const aggregate = groups.get(year) ?? emptyYearlyAggregate(year);

    aggregate.principal += row.principal;
    aggregate.interest += row.interest + row.simpleInterest;
    aggregate.prepayment += row.prepayment;
    aggregate.emi += row.emi;
    aggregate.count += 1;
    aggregate.endBalance = row.closingBalance;
    groups.set(year, aggregate);

    return groups;
  }, new Map<number, YearlyAggregate>());

  return Array.from(yearly.values());
}

function emptyYearlyAggregate(year: number): YearlyAggregate {
  return {
    year,
    principal: 0,
    interest: 0,
    prepayment: 0,
    emi: 0,
    count: 0,
    endBalance: 0,
  };
}

function totalCompletedRows(rows: ScheduleRow[]): {
  principal: number;
  interest: number;
  emi: number;
  prepayment: number;
} {
  return rows.reduce(
    (sum, row) => ({
      principal: sum.principal + row.principal + row.prepayment,
      interest: sum.interest + row.interest + row.simpleInterest,
      emi: sum.emi + row.emi,
      prepayment: sum.prepayment + row.prepayment,
    }),
    { principal: 0, interest: 0, emi: 0, prepayment: 0 },
  );
}

function emiDateFromIndex(startDate: string, monthIndex: number): string {
  const start = parseIsoDate(startDate);
  const zeroBasedMonth = start.month - 1 + (monthIndex - 1);
  const year = start.year + Math.floor(zeroBasedMonth / 12);
  const month = positiveModulo(zeroBasedMonth, 12) + 1;
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const day = Math.min(start.day, lastDay);

  return `${year}-${pad2(month)}-${pad2(day)}`;
}

function positiveModulo(value: number, divisor: number): number {
  return ((value % divisor) + divisor) % divisor;
}

function parseIsoDate(date: string): DateParts {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (match === null) {
    throw new Error(`Invalid ISO date: ${date}`);
  }

  const [, year, month, day] = match;
  const parts = {
    year: Number(year),
    month: Number(month),
    day: Number(day),
  };

  validateDateParts(date, parts);

  return parts;
}

function validateDateParts(date: string, parts: DateParts): void {
  const lastDay = new Date(Date.UTC(parts.year, parts.month, 0)).getUTCDate();

  if (parts.month < 1 || parts.month > 12 || parts.day < 1 || parts.day > lastDay) {
    throw new Error(`Invalid calendar date: ${date}`);
  }
}

/**
 * Validates a loan configuration and throws on the first invalid field.
 *
 * @param config - Loan configuration to validate.
 * @returns Nothing; throws an `Error` describing the first problem found.
 */
export function validateLoanConfig(config: LoanConfig): void {
  validatePositiveNumber(config.principal, 'principal');
  validatePositiveInteger(config.tenureMonths, 'tenureMonths');
  validateNonNegativeNumber(config.originalRate, 'originalRate');
  if (config.preEmiInterest !== undefined) {
    validateNonNegativeNumber(config.preEmiInterest, 'preEmiInterest');
  }
  parseIsoDate(config.startDate);
  config.rateChanges.forEach((event) => validateRateChange(event));
  config.partPayments.forEach((event) => validatePartPayment(event));
}

function validateRateChange(event: RateChange): void {
  parseIsoDate(event.date);
  validateNonNegativeNumber(event.rate, 'rate');
}

function validatePartPayment(event: PartPayment): void {
  parseIsoDate(event.date);
  validatePositiveNumber(event.amount, 'amount');
}

function validatePositiveNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${name} must be a positive number`);
  }
}

function validateNonNegativeNumber(value: number, name: string): void {
  if (!Number.isFinite(value) || value < 0) {
    throw new Error(`${name} must be a non-negative number`);
  }
}

function validatePositiveInteger(value: number, name: string): void {
  if (!Number.isInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive integer`);
  }
}

function pad2(value: number): string {
  return String(value).padStart(2, '0');
}
