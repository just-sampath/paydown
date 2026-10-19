import { FlaskConical, Plus, Trash2 } from 'lucide-react';
import { useMemo, useState, type CSSProperties } from 'react';

import { createEmptyScenario, type WhatIfScenario } from '../app/storage';
import { DraftDateInput, DraftNumberInput } from '../components/DraftInputs';
import { AddEventForm, UndoNotice, useUndoable } from '../components/EventEditing';
import { Card, EmptyState, toneClass, toneOf } from '../components/Primitives';
import { classNames } from '../utils/classNames';
import {
  createSchedule,
  type LoanAnalysis,
  type LoanConfig,
  type LoanSchedule,
} from '../features/loan/loanEngine';
import {
  formatDuration,
  formatInrShort,
  formatMonthYear,
  formatPercent,
  pluralize,
} from '../utils/format';
import { RATE_HINT, RATE_LIMITS, exampleRate, rateConflict } from '../utils/rates';
import { interestShift, timeShift } from '../utils/savings';

type WhatIfPageProps = {
  analysis: LoanAnalysis;
  baseConfig: LoanConfig;
  scenarios: WhatIfScenario[];
  onChange: (scenarios: WhatIfScenario[]) => void;
};

const EVENT_COLUMNS = { '--event-columns': 'minmax(0, 1fr) minmax(0, 1fr) 36px' } as CSSProperties;

const AMOUNT_HINT = 'Enter an amount of at least ₹1.';

/**
 * Renders the what-if simulator: named scenarios that add pretend rate changes and part
 * payments on top of the real ones, compared against the current and original plans.
 *
 * @param props - What-if props.
 * @param props.analysis - Current loan analysis for baseline comparison.
 * @param props.baseConfig - Current loan config used as the scenario baseline.
 * @param props.scenarios - Persisted what-if scenarios.
 * @param props.onChange - Callback for persisting scenario edits.
 * @returns What-if page element.
 */
export function WhatIfPage({ analysis, baseConfig, scenarios, onChange }: WhatIfPageProps) {
  const [activeId, setActiveId] = useState<string | null>(scenarios[0]?.id ?? null);
  const activeScenario = scenarios.find((scenario) => scenario.id === activeId) ?? scenarios[0];
  const results = useMemo(
    () =>
      new Map(
        scenarios.map((scenario) => [
          scenario.id,
          createSchedule({
            ...baseConfig,
            rateChanges: [...baseConfig.rateChanges, ...scenario.rateChanges],
            partPayments: [...baseConfig.partPayments, ...scenario.partPayments],
          }),
        ]),
      ),
    [baseConfig, scenarios],
  );
  const nextDate = analysis.nextRow?.date ?? baseConfig.startDate;
  const undo = useUndoable<{ scenario: WhatIfScenario; index: number }>();
  const removed = undo.removed;

  const addScenario = (
    events?: Pick<WhatIfScenario, 'rateChanges' | 'partPayments'>,
    name?: string,
  ) => {
    const created = createEmptyScenario(scenarios, events);
    const scenario = name ? { ...created, name } : created;
    undo.forget();
    onChange([...scenarios, scenario]);
    setActiveId(scenario.id);
  };

  const removeScenario = (scenario: WhatIfScenario): void => {
    const index = scenarios.findIndex((item) => item.id === scenario.id);
    undo.remember({ scenario, index }, `${scenario.name || 'Untitled'} deleted.`);
    onChange(scenarios.filter((item) => item.id !== scenario.id));
    setActiveId(null);
  };

  const restoreScenario = (): void => {
    if (removed === null) {
      return;
    }

    const next = [...scenarios];
    next.splice(removed.item.index, 0, removed.item.scenario);
    onChange(next);
    setActiveId(removed.item.scenario.id);
    undo.forget();
  };

  return (
    <div className="content stack">
      {removed && (
        <UndoNotice key={removed.label} onDismiss={undo.forget} onUndo={restoreScenario}>
          {removed.label}
        </UndoNotice>
      )}

      {activeScenario === undefined ? (
        <Card>
          <EmptyState
            icon={<FlaskConical size={34} />}
            title="No scenarios yet"
            hint="A scenario adds pretend rate changes or part payments on top of your real ones, so you can see the effect before you act. Start from one of these:"
          >
            <div className="preset-list">
              <button
                className="btn btn-primary"
                type="button"
                onClick={() =>
                  addScenario(
                    { rateChanges: [], partPayments: [{ date: nextDate, amount: 100_000 }] },
                    `₹1L extra in ${formatMonthYear(nextDate)}`,
                  )
                }
              >
                Pay ₹1,00,000 extra next month
              </button>
              <PresetRateCut analysis={analysis} nextDate={nextDate} onAdd={addScenario} />
              <button className="btn" type="button" onClick={() => addScenario()}>
                <Plus aria-hidden="true" size={16} />
                Empty scenario
              </button>
            </div>
          </EmptyState>
        </Card>
      ) : (
        <>
          <div className="scenario-tabs" role="tablist" aria-label="Scenarios">
            {scenarios.map((scenario) => (
              <button
                aria-selected={scenario.id === activeScenario.id}
                className="scenario-tab"
                key={scenario.id}
                role="tab"
                type="button"
                onClick={() => setActiveId(scenario.id)}
              >
                <span className="swatch" style={{ background: scenario.color }} />
                {scenario.name || 'Untitled'}
              </button>
            ))}
            <button className="btn btn-primary" type="button" onClick={() => addScenario()}>
              <Plus aria-hidden="true" size={16} />
              New scenario
            </button>
          </div>

          <ScenarioHeader
            current={analysis.actual}
            scenario={activeScenario}
            schedule={results.get(activeScenario.id)}
            onDelete={() => removeScenario(activeScenario)}
            onRename={(name) => patchScenario(scenarios, activeScenario, { name }, onChange)}
          />

          <ScenarioEvents
            baseConfig={baseConfig}
            currentRate={analysis.nextRow?.rate ?? analysis.actual.rows.at(-1)?.rate ?? 0}
            nextDate={nextDate}
            scenario={activeScenario}
            onPatch={(patch) => patchScenario(scenarios, activeScenario, patch, onChange)}
          />
        </>
      )}

      {/* With no scenario the table would only repeat the dashboard, so it waits for one. */}
      {activeScenario && (
        <Card
          eyebrow="Comparison"
          title="Every plan side by side"
          subtitle="The original plan has no rate changes or part payments. Your current plan has the real ones. Each scenario adds its own on top."
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Plan</th>
                  <th className="numeric col-optional">Payoff</th>
                  <th className="numeric col-optional">Length</th>
                  <th className="numeric col-optional">Interest</th>
                  <th className="cell-wrap">Against your current plan</th>
                </tr>
              </thead>
              <tbody>
                <ComparisonRow
                  current={analysis.actual}
                  name="Original plan"
                  schedule={analysis.original}
                />
                <ComparisonRow
                  current={analysis.actual}
                  name="Current plan"
                  schedule={analysis.actual}
                />
                {scenarios.map((scenario) => {
                  const schedule = results.get(scenario.id);
                  return schedule ? (
                    <ComparisonRow
                      active={scenario.id === activeScenario?.id}
                      color={scenario.color}
                      current={analysis.actual}
                      key={scenario.id}
                      name={scenario.name || 'Untitled'}
                      schedule={schedule}
                    />
                  ) : null;
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );
}

function patchScenario(
  scenarios: WhatIfScenario[],
  target: WhatIfScenario,
  patch: Partial<WhatIfScenario>,
  onChange: (scenarios: WhatIfScenario[]) => void,
): void {
  onChange(scenarios.map((item) => (item.id === target.id ? { ...item, ...patch } : item)));
}

function PresetRateCut({
  analysis,
  nextDate,
  onAdd,
}: {
  analysis: LoanAnalysis;
  nextDate: string;
  onAdd: (events: Pick<WhatIfScenario, 'rateChanges' | 'partPayments'>, name: string) => void;
}) {
  const currentRate = analysis.nextRow?.rate ?? analysis.actual.rows.at(-1)?.rate ?? 0;
  const cutRate = Math.max(RATE_LIMITS.min, Number((currentRate - 0.5).toFixed(2)));

  return (
    <button
      className="btn btn-primary"
      type="button"
      onClick={() =>
        onAdd(
          { rateChanges: [{ date: nextDate, rate: cutRate }], partPayments: [] },
          `Rate down to ${formatPercent(cutRate)}`,
        )
      }
    >
      Rate drops to {formatPercent(cutRate)} next month
    </button>
  );
}

type ScenarioHeaderProps = {
  scenario: WhatIfScenario;
  /** The scenario's schedule, so its result stays next to the inputs while they change. */
  schedule: LoanSchedule | undefined;
  current: LoanSchedule;
  onRename: (name: string) => void;
  onDelete: () => void;
};

function ScenarioHeader({ scenario, schedule, current, onRename, onDelete }: ScenarioHeaderProps) {
  const events = scenario.partPayments.length + scenario.rateChanges.length;

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3">
        <label className="grid min-w-[220px] flex-1 gap-1.5" htmlFor="scenario-name">
          <span className="field-label">Scenario name</span>
          <input
            className="input"
            id="scenario-name"
            value={scenario.name}
            onBlur={() => {
              if (scenario.name.trim() === '') {
                onRename('Untitled');
              }
            }}
            onChange={(event) => onRename(event.target.value)}
          />
        </label>
        <button className="btn btn-quiet-danger" type="button" onClick={onDelete}>
          <Trash2 aria-hidden="true" size={15} />
          Delete scenario
        </button>
      </div>
      {events > 0 && schedule && <ScenarioOutcome current={current} schedule={schedule} />}
      <p className="subtle m-0 mt-3 text-sm">
        {events === 0
          ? 'Add a pretend part payment or rate change below to see what it changes.'
          : `Adds ${scenarioContents(scenario)} to your real ones. Its row in the comparison below is highlighted.`}
      </p>
    </Card>
  );
}

function ScenarioOutcome({ schedule, current }: { schedule: LoanSchedule; current: LoanSchedule }) {
  const monthsSaved = current.summary.totalMonths - schedule.summary.totalMonths;
  const interestSaved = current.summary.totalInterest - schedule.summary.totalInterest;

  return (
    <p className="scenario-outcome" role="status">
      <span className={toneClass(toneOf(monthsSaved))}>
        {timeShift(monthsSaved)}, {interestShift(interestSaved)}
      </span>{' '}
      than your current plan. Debt-free {formatMonthYear(schedule.summary.payoffDate)}.
    </p>
  );
}

function scenarioContents(scenario: WhatIfScenario): string {
  const parts = [
    scenario.partPayments.length > 0 && pluralize(scenario.partPayments.length, 'part payment'),
    scenario.rateChanges.length > 0 && pluralize(scenario.rateChanges.length, 'rate change'),
  ];

  return parts.filter(Boolean).join(' and ');
}

type ScenarioEventsProps = {
  baseConfig: LoanConfig;
  scenario: WhatIfScenario;
  currentRate: number;
  nextDate: string;
  onPatch: (patch: Partial<WhatIfScenario>) => void;
};

function ScenarioEvents({
  baseConfig,
  scenario,
  currentRate,
  nextDate,
  onPatch,
}: ScenarioEventsProps) {
  const minDate = baseConfig.startDate;
  const allRates = [...baseConfig.rateChanges, ...scenario.rateChanges];

  return (
    <div className="split is-even">
      <Card
        eyebrow="Pretend part payments"
        title="Extra lump sums"
        subtitle="Added on top of the part payments you have already made."
      >
        <div className="stack gap-4">
          <ScenarioEventList
            emptyText="No extra part payments in this scenario."
            events={scenario.partPayments.map((payment) => ({
              date: payment.date,
              value: payment.amount,
            }))}
            kind="payment"
            minDate={minDate}
            onChange={(events) =>
              onPatch({
                partPayments: events.map((event) => ({ date: event.date, amount: event.value })),
              })
            }
          />
          <AddEventForm
            defaultDate={nextDate}
            idPrefix="scenario-payment"
            minDate={minDate}
            minValue={1}
            submitLabel="Add payment"
            valueHint={AMOUNT_HINT}
            valueLabel="Amount"
            valueExample="1,00,000"
            valuePrefix="₹"
            onAdd={(date, amount) =>
              onPatch({ partPayments: sortByDate([...scenario.partPayments, { date, amount }]) })
            }
          />
        </div>
      </Card>
      <Card
        eyebrow="Pretend rate changes"
        title="Different rates"
        subtitle="Each one sets the rate from its date onward, on top of your real rate changes."
      >
        <div className="stack gap-4">
          <ScenarioEventList
            emptyText="No rate changes in this scenario."
            events={scenario.rateChanges.map((change) => ({
              date: change.date,
              value: change.rate,
            }))}
            kind="rate"
            minDate={minDate}
            onChange={(events) =>
              onPatch({
                rateChanges: events.map((event) => ({ date: event.date, rate: event.value })),
              })
            }
          />
          <AddEventForm
            check={(date, rate) => rateConflict(date, rate, baseConfig.originalRate, allRates)}
            defaultDate={nextDate}
            idPrefix="scenario-rate"
            maxValue={RATE_LIMITS.max}
            minDate={minDate}
            minValue={RATE_LIMITS.min}
            submitLabel="Add rate"
            valueHint={RATE_HINT}
            valueLabel="New rate"
            valueExample={exampleRate(currentRate)}
            valueSuffix="%"
            onAdd={(date, rate) =>
              onPatch({ rateChanges: sortByDate([...scenario.rateChanges, { date, rate }]) })
            }
          />
        </div>
      </Card>
    </div>
  );
}

type ScenarioEvent = { date: string; value: number };

function ScenarioEventList({
  events,
  kind,
  minDate,
  emptyText,
  onChange,
}: {
  events: ScenarioEvent[];
  kind: 'payment' | 'rate';
  minDate: string;
  emptyText: string;
  onChange: (events: ScenarioEvent[]) => void;
}) {
  if (events.length === 0) {
    return <p className="subtle m-0 text-sm">{emptyText}</p>;
  }

  const noun = kind === 'payment' ? 'payment' : 'rate change';
  const update = (index: number, patch: Partial<ScenarioEvent>) =>
    onChange(sortByDate(events.map((event, i) => (i === index ? { ...event, ...patch } : event))));

  return (
    <div className="event-list" style={EVENT_COLUMNS}>
      <div className="event-row is-head" aria-hidden="true">
        <span>Date</span>
        <span>{kind === 'payment' ? 'Amount' : 'New rate'}</span>
        <span />
      </div>
      {events.map((event, index) => (
        <div className="event-row" key={`${event.date}-${index}`}>
          <DraftDateInput
            ariaLabel={`Date of scenario ${noun} ${index + 1}`}
            min={minDate}
            value={event.date}
            onCommit={(date) => update(index, { date })}
          />
          <DraftNumberInput
            ariaLabel={`${kind === 'payment' ? 'Amount' : 'Rate'} of scenario ${noun} ${index + 1}`}
            grouped={kind === 'payment'}
            invalidHint={kind === 'payment' ? AMOUNT_HINT : RATE_HINT}
            max={kind === 'payment' ? undefined : RATE_LIMITS.max}
            min={kind === 'payment' ? 1 : RATE_LIMITS.min}
            prefix={kind === 'payment' ? '₹' : undefined}
            suffix={kind === 'rate' ? '%' : undefined}
            value={event.value}
            onCommit={(value) => update(index, { value })}
          />
          <button
            aria-label={`Remove scenario ${noun} ${index + 1}`}
            className="icon-btn"
            type="button"
            onClick={() => onChange(events.filter((_, i) => i !== index))}
          >
            <Trash2 aria-hidden="true" size={15} />
          </button>
        </div>
      ))}
    </div>
  );
}

function ComparisonRow({
  name,
  schedule,
  current,
  color,
  active = false,
}: {
  name: string;
  schedule: LoanSchedule;
  current: LoanSchedule;
  color?: string;
  active?: boolean;
}) {
  const isCurrent = schedule === current;
  const monthsSaved = current.summary.totalMonths - schedule.summary.totalMonths;
  const interestSaved = current.summary.totalInterest - schedule.summary.totalInterest;

  return (
    <tr
      aria-current={active ? 'true' : undefined}
      className={classNames(isCurrent && 'font-bold', active && 'is-active-row')}
    >
      <td className="cell-wrap plan-cell">
        <span className="inline-flex items-center gap-2">
          <span
            className="swatch"
            style={{ background: color ?? (isCurrent ? 'var(--primary)' : 'var(--c-baseline)') }}
          />
          {name}
        </span>
        <span className="only-narrow-block subtle text-xs font-semibold">
          Payoff {formatMonthYear(schedule.summary.payoffDate)}
        </span>
      </td>
      <td className="numeric col-optional">{formatMonthYear(schedule.summary.payoffDate)}</td>
      <td className="numeric col-optional">{formatDuration(schedule.summary.totalMonths)}</td>
      <td className="numeric col-optional">{formatInrShort(schedule.summary.totalInterest)}</td>
      <td
        className={classNames('cell-wrap', isCurrent ? 'subtle' : toneClass(toneOf(monthsSaved)))}
      >
        {isCurrent
          ? 'Your plan today'
          : `${timeShift(monthsSaved)}, ${interestShift(interestSaved)}`}
      </td>
    </tr>
  );
}

function sortByDate<T extends { date: string }>(items: T[]): T[] {
  return [...items].sort((left, right) => left.date.localeCompare(right.date));
}
