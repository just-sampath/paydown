import { HelpCircle, Plus, Trash2, TrendingDown, WalletCards } from 'lucide-react';
import { useMemo, useState } from 'react';

import { Card, EmptyState } from '../components/Primitives';
import { DraftDateInput, DraftNumberInput } from '../components/DraftInputs';
import type { WhatIfScenario } from '../app/storage';
import {
  createSchedule,
  type LoanAnalysis,
  type LoanConfig,
  type PartPayment,
  type RateChange,
} from '../features/loan/loanEngine';
import { formatDuration, formatInrShort, formatMonthYear } from '../utils/format';

type WhatIfPageProps = {
  analysis: LoanAnalysis;
  baseConfig: LoanConfig;
  scenarios: WhatIfScenario[];
  onAddScenario: () => void;
  onChange: (scenarios: WhatIfScenario[]) => void;
};

/**
 * Renders the multi-scenario what-if simulator.
 *
 * @param props - What-if props.
 * @param props.analysis - Current loan analysis for baseline comparison.
 * @param props.baseConfig - Current loan config used as the scenario baseline.
 * @param props.scenarios - Persisted what-if scenarios.
 * @param props.onAddScenario - Callback that creates an empty scenario.
 * @param props.onChange - Callback for persisting scenario edits.
 * @returns What-if simulator page element.
 */
export function WhatIfPage({
  analysis,
  baseConfig,
  scenarios,
  onAddScenario,
  onChange,
}: WhatIfPageProps) {
  const [activeId, setActiveId] = useState<string | null>(scenarios[0]?.id ?? null);
  const activeScenario = scenarios.find((scenario) => scenario.id === activeId) ?? scenarios[0];
  const scenarioResults = useMemo(
    () =>
      scenarios.map((scenario) => ({
        scenario,
        schedule: createSchedule({
          ...baseConfig,
          rateChanges: [...baseConfig.rateChanges, ...scenario.rateChanges],
          partPayments: [...baseConfig.partPayments, ...scenario.partPayments],
        }),
      })),
    [baseConfig, scenarios],
  );
  const activeResult = scenarioResults.find((result) => result.scenario.id === activeScenario?.id);
  const activeMonthsSaved =
    activeResult === undefined
      ? 0
      : analysis.actual.summary.totalMonths - activeResult.schedule.summary.totalMonths;
  const activeInterestSaved =
    activeResult === undefined
      ? 0
      : analysis.actual.summary.totalInterest - activeResult.schedule.summary.totalInterest;

  return (
    <div className="content">
      <section
        className="hero"
        style={
          {
            '--hero-from': '#2a2148',
            '--hero-mid': '#765fc2',
            '--hero-to': '#e89568',
          } as React.CSSProperties
        }
      >
        <div>
          <div className="label mb-4 text-[var(--teal)]">Simulate the future</div>
          <h1>
            What if you
            <br />
            <em>did even more?</em>
          </h1>
          <p className="mt-5 max-w-[560px] text-base leading-7 text-white/85">
            Build named scenarios with their own prepayments and rate revisions, then compare them
            against your original and current plans.
          </p>
        </div>
        <div className="hero-stats">
          <HeroScenarioStat
            label="Active scenario"
            value={activeScenario?.name ?? 'None'}
            detail={activeScenario ? 'Add events to model impact' : 'Create a scenario'}
          />
          <HeroScenarioStat
            label="Extra saved"
            value={formatScenarioMonths(activeMonthsSaved)}
            detail={formatScenarioInterest(activeInterestSaved)}
          />
        </div>
      </section>

      <div className="mt-6 flex flex-wrap items-center gap-2">
        {scenarios.map((scenario) => (
          <button
            className="btn"
            key={scenario.id}
            onClick={() => setActiveId(scenario.id)}
            style={{ borderColor: scenario.id === activeScenario?.id ? scenario.color : undefined }}
          >
            <span className="h-2 w-2 rounded-sm" style={{ background: scenario.color }} />
            {scenario.name}
          </button>
        ))}
        <button className="btn btn-primary" onClick={onAddScenario}>
          <Plus size={16} />
          New scenario
        </button>
      </div>

      {activeScenario === undefined ? (
        <Card className="mt-6">
          <EmptyState
            icon={<HelpCircle size={36} />}
            title="No what-if scenarios yet."
            hint="Create one to add hypothetical prepayments or rate changes."
          />
        </Card>
      ) : (
        <ScenarioEditor
          scenario={activeScenario}
          scenarios={scenarios}
          startDate={baseConfig.startDate}
          newEventDate={analysis.nextRow?.date ?? baseConfig.startDate}
          onChange={onChange}
        />
      )}

      <Card className="mt-6" eyebrow="Side-by-side outcome" title="All scenarios compared">
        <div className="grid gap-4 xl:grid-cols-4">
          <Comparison
            title="Original"
            subtitle="No rate changes or prepayments"
            payoff={analysis.original.summary.payoffDate}
            months={analysis.original.summary.totalMonths}
            interest={analysis.original.summary.totalInterest}
          />
          <Comparison
            title="Current plan"
            subtitle="Your actual events"
            payoff={analysis.actual.summary.payoffDate}
            months={analysis.actual.summary.totalMonths}
            interest={analysis.actual.summary.totalInterest}
            accent
          />
          {scenarioResults.map((result) => (
            <Comparison
              key={result.scenario.id}
              title={result.scenario.name}
              subtitle={`${result.scenario.rateChanges.length} rates · ${result.scenario.partPayments.length} prepays`}
              payoff={result.schedule.summary.payoffDate}
              months={result.schedule.summary.totalMonths}
              interest={result.schedule.summary.totalInterest}
              color={result.scenario.color}
            />
          ))}
        </div>
      </Card>
    </div>
  );
}

type ScenarioEditorProps = {
  scenario: WhatIfScenario;
  scenarios: WhatIfScenario[];
  startDate: string;
  newEventDate?: string;
  onChange: (scenarios: WhatIfScenario[]) => void;
};

function ScenarioEditor({
  scenario,
  scenarios,
  startDate,
  newEventDate = startDate,
  onChange,
}: ScenarioEditorProps) {
  return (
    <div className="section-grid">
      <Card
        eyebrow={`${scenario.name} · prepayments`}
        title="Hypothetical part payments"
        action={
          <button
            className="btn btn-primary"
            onClick={() =>
              patchScenario(
                scenarios,
                scenario.id,
                {
                  partPayments: [...scenario.partPayments, { date: newEventDate, amount: 100_000 }],
                },
                onChange,
              )
            }
          >
            <Plus size={16} />
            Add
          </button>
        }
      >
        <ScenarioName
          scenario={scenario}
          scenarios={scenarios}
          startDate={startDate}
          onChange={onChange}
        />
        {scenario.partPayments.length === 0 ? (
          <EmptyState
            icon={<WalletCards size={36} />}
            title="No hypothetical prepayments yet."
            hint="Add one to see how it affects payoff."
          />
        ) : (
          <PaymentRows
            scenario={scenario}
            scenarios={scenarios}
            startDate={startDate}
            onChange={onChange}
          />
        )}
      </Card>

      <Card
        eyebrow={`${scenario.name} · rate revisions`}
        title="Hypothetical rate changes"
        action={
          <button
            className="btn btn-primary"
            onClick={() =>
              patchScenario(
                scenarios,
                scenario.id,
                { rateChanges: [...scenario.rateChanges, { date: newEventDate, rate: 7 }] },
                onChange,
              )
            }
          >
            <Plus size={16} />
            Add
          </button>
        }
      >
        {scenario.rateChanges.length === 0 ? (
          <EmptyState
            icon={<TrendingDown size={36} />}
            title="No hypothetical rate changes yet."
            hint="Add one to forecast tenure impact."
          />
        ) : (
          <RateRows
            scenario={scenario}
            scenarios={scenarios}
            startDate={startDate}
            onChange={onChange}
          />
        )}
      </Card>
    </div>
  );
}

function ScenarioName({ scenario, scenarios, onChange }: ScenarioEditorProps) {
  return (
    <div className="mb-4 flex gap-3">
      <input
        className="input"
        value={scenario.name}
        onChange={(event) =>
          patchScenario(scenarios, scenario.id, { name: event.target.value }, onChange)
        }
      />
      <button
        className="icon-btn"
        onClick={() => onChange(scenarios.filter((item) => item.id !== scenario.id))}
        aria-label="Delete scenario"
      >
        <Trash2 size={16} />
      </button>
    </div>
  );
}

function PaymentRows({ scenario, scenarios, startDate, onChange }: ScenarioEditorProps) {
  return (
    <div className="grid gap-3">
      {scenario.partPayments.map((payment, index) => (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" key={`${payment.date}-${index}`}>
          <DraftDateInput
            ariaLabel={`Scenario prepayment date ${index + 1}`}
            className="input"
            min={startDate}
            value={payment.date}
            onCommit={(date) =>
              updateScenarioPayment(scenario, scenarios, index, { date }, onChange)
            }
          />
          <DraftNumberInput
            ariaLabel={`Scenario prepayment amount ${index + 1}`}
            className="input"
            min={0.01}
            step={10_000}
            value={payment.amount}
            onCommit={(amount) =>
              updateScenarioPayment(scenario, scenarios, index, { amount }, onChange)
            }
          />
          <button
            className="icon-btn"
            onClick={() => removeScenarioPayment(scenario, scenarios, index, onChange)}
            aria-label="Remove scenario prepayment"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

function RateRows({ scenario, scenarios, startDate, onChange }: ScenarioEditorProps) {
  return (
    <div className="grid gap-3">
      {scenario.rateChanges.map((rate, index) => (
        <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]" key={`${rate.date}-${index}`}>
          <DraftDateInput
            ariaLabel={`Scenario rate date ${index + 1}`}
            className="input"
            min={startDate}
            value={rate.date}
            onCommit={(date) => updateScenarioRate(scenario, scenarios, index, { date }, onChange)}
          />
          <DraftNumberInput
            ariaLabel={`Scenario rate ${index + 1}`}
            className="input"
            min={0}
            step={0.05}
            value={rate.rate}
            onCommit={(nextRate) =>
              updateScenarioRate(scenario, scenarios, index, { rate: nextRate }, onChange)
            }
          />
          <button
            className="icon-btn"
            onClick={() => removeScenarioRate(scenario, scenarios, index, onChange)}
            aria-label="Remove scenario rate"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ))}
    </div>
  );
}

function Comparison({
  title,
  subtitle,
  payoff,
  months,
  interest,
  accent = false,
  color,
}: {
  title: string;
  subtitle: string;
  payoff: string;
  months: number;
  interest: number;
  accent?: boolean;
  color?: string;
}) {
  return (
    <div
      className="rounded-lg border border-[var(--hairline)] bg-[var(--surface-2)] p-5"
      style={{ borderColor: color }}
    >
      <div className={accent ? 'text-[var(--primary)]' : ''}>
        <div className="font-extrabold">{title}</div>
        <div className="subtle mt-1 text-xs">{subtitle}</div>
      </div>
      <div className="mt-5 text-2xl font-extrabold">{formatMonthYear(payoff)}</div>
      <div className="label mt-1">Payoff date</div>
      <div className="mt-5 grid gap-2 text-sm">
        <div className="flex justify-between">
          <span className="subtle">Tenure</span>
          <strong>{formatDuration(months)}</strong>
        </div>
        <div className="flex justify-between">
          <span className="subtle">Interest</span>
          <strong>{formatInrShort(interest)}</strong>
        </div>
      </div>
    </div>
  );
}

function HeroScenarioStat({
  label,
  value,
  detail,
}: {
  label: string;
  value: string;
  detail: string;
}) {
  return (
    <div className="hero-stat">
      <div className="label text-white/70">{label}</div>
      <div className="mt-2 text-2xl font-extrabold">{value}</div>
      <div className="mt-1 text-sm font-semibold text-[var(--teal)]">{detail}</div>
    </div>
  );
}

function formatScenarioMonths(months: number): string {
  if (months === 0) {
    return '0 mo';
  }

  const prefix = months > 0 ? '+' : '-';
  return `${prefix}${formatDuration(Math.abs(months))}`;
}

function formatScenarioInterest(amount: number): string {
  if (amount === 0) {
    return '₹0 interest saved';
  }

  if (amount > 0) {
    return `+${formatInrShort(amount)} interest saved`;
  }

  return `${formatInrShort(Math.abs(amount))} extra interest`;
}

function patchScenario(
  scenarios: WhatIfScenario[],
  id: string,
  patch: Partial<WhatIfScenario>,
  onChange: (scenarios: WhatIfScenario[]) => void,
): void {
  onChange(scenarios.map((item) => (item.id === id ? { ...item, ...patch } : item)));
}

function updateScenarioPayment(
  scenario: WhatIfScenario,
  scenarios: WhatIfScenario[],
  index: number,
  patch: Partial<PartPayment>,
  onChange: (scenarios: WhatIfScenario[]) => void,
): void {
  patchScenario(
    scenarios,
    scenario.id,
    {
      partPayments: scenario.partPayments.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    },
    onChange,
  );
}

function updateScenarioRate(
  scenario: WhatIfScenario,
  scenarios: WhatIfScenario[],
  index: number,
  patch: Partial<RateChange>,
  onChange: (scenarios: WhatIfScenario[]) => void,
): void {
  patchScenario(
    scenarios,
    scenario.id,
    {
      rateChanges: scenario.rateChanges.map((item, itemIndex) =>
        itemIndex === index ? { ...item, ...patch } : item,
      ),
    },
    onChange,
  );
}

function removeScenarioPayment(
  scenario: WhatIfScenario,
  scenarios: WhatIfScenario[],
  index: number,
  onChange: (scenarios: WhatIfScenario[]) => void,
): void {
  patchScenario(
    scenarios,
    scenario.id,
    { partPayments: scenario.partPayments.filter((_, itemIndex) => itemIndex !== index) },
    onChange,
  );
}

function removeScenarioRate(
  scenario: WhatIfScenario,
  scenarios: WhatIfScenario[],
  index: number,
  onChange: (scenarios: WhatIfScenario[]) => void,
): void {
  patchScenario(
    scenarios,
    scenario.id,
    { rateChanges: scenario.rateChanges.filter((_, itemIndex) => itemIndex !== index) },
    onChange,
  );
}
