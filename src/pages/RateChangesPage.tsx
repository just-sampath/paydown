import { Plus, Trash2 } from 'lucide-react';

import { Card, StatCard } from '../components/Primitives';
import { DraftDateInput, DraftNumberInput } from '../components/DraftInputs';
import {
  getEffectiveMonthIndex,
  type LoanAnalysis,
  type RateChange,
} from '../features/loan/loanEngine';
import { formatDuration, formatInr, formatInrShort, formatPercent } from '../utils/format';

type RateChangesPageProps = {
  analysis: LoanAnalysis;
  rateChanges: RateChange[];
  onChange: (rateChanges: RateChange[]) => void;
};

/**
 * Renders the floating-rate revisions page.
 *
 * @param props - Rate change page props.
 * @param props.analysis - Loan analysis containing rate impacts.
 * @param props.rateChanges - Editable rate change list.
 * @param props.onChange - Callback for persisting rate changes.
 * @returns Rate changes page element.
 */
export function RateChangesPage({ analysis, rateChanges, onChange }: RateChangesPageProps) {
  const totalMonths = analysis.rateCategoryImpact.monthsSaved;
  const totalInterest = analysis.rateCategoryImpact.interestSaved;
  const currentRate = analysis.nextRow?.rate ?? analysis.actual.rows.at(-1)?.rate ?? 0;
  const startRate = analysis.original.rows[0]?.rate ?? currentRate;
  const newEventDate = analysis.nextRow?.date ?? analysis.actual.rows.at(-1)?.date ?? '';

  return (
    <div className="content">
      <div className="grid gap-4 lg:grid-cols-3">
        <StatCard
          label="Rate revisions"
          value={rateChanges.length}
          detail={`From ${formatPercent(startRate)} to ${formatPercent(currentRate)}`}
        />
        <StatCard
          label="Months saved by rate drops"
          value={totalMonths}
          detail={formatDuration(totalMonths)}
        />
        <StatCard
          label="Interest avoided"
          value={formatInrShort(totalInterest)}
          detail="vs the same prepayments with no rate changes"
        />
      </div>

      <div className="section-grid">
        <Card
          eyebrow="Floating rate journey"
          title="Rate changes and impact"
          subtitle="Event rows are chronological incremental estimates and depend on event order."
          action={
            <button
              className="btn btn-primary"
              onClick={() =>
                onChange(sortRates([...rateChanges, { date: newEventDate, rate: currentRate }]))
              }
            >
              <Plus size={16} />
              Add rate
            </button>
          }
        >
          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Effective from</th>
                  <th className="numeric">New rate</th>
                  <th className="numeric">Months saved</th>
                  <th className="numeric">Interest saved</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {rateChanges.map((rateChange, index) => {
                  const impact = analysis.rateImpacts[index];

                  return (
                    <tr key={`${rateChange.date}-${index}`}>
                      <td>
                        <DraftDateInput
                          ariaLabel={`Effective date for rate change ${index + 1}`}
                          className="input min-w-40"
                          min={analysis.actual.rows[0]?.date}
                          value={rateChange.date}
                          onCommit={(date) => updateRate(rateChanges, index, { date }, onChange)}
                        />
                      </td>
                      <td className="numeric">
                        <DraftNumberInput
                          ariaLabel={`Rate for change ${index + 1}`}
                          className="input min-w-28 text-right"
                          min={0}
                          step={0.05}
                          value={rateChange.rate}
                          onCommit={(rate) => updateRate(rateChanges, index, { rate }, onChange)}
                        />
                      </td>
                      <td className="numeric font-bold">{impact?.monthsSaved ?? 0}</td>
                      <td className="numeric font-bold text-[var(--jade)]">
                        {formatInrShort(impact?.interestSaved ?? 0)}
                      </td>
                      <td>
                        <button
                          className="icon-btn"
                          onClick={() => removeRate(rateChanges, index, onChange)}
                          aria-label="Delete rate change"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>

        <Card
          eyebrow="Rate trajectory"
          title={`${formatPercent(startRate)} → ${formatPercent(currentRate)}`}
        >
          <RateTrajectoryChart
            analysis={analysis}
            currentRate={currentRate}
            rateChanges={rateChanges}
          />
          <div className="my-5 border-t border-[var(--hairline)]" />
          <div className="grid gap-4 sm:grid-cols-2">
            <Metric label="Starting rate" value={formatPercent(startRate)} />
            <Metric label="Current rate" value={formatPercent(currentRate)} accent />
            <Metric label="Total drop" value={`${(startRate - currentRate).toFixed(2)}%`} />
            <Metric label="EMI unchanged" value={formatInr(analysis.actual.summary.baseEmi)} />
          </div>
        </Card>
      </div>
    </div>
  );
}

function RateTrajectoryChart({
  analysis,
  currentRate,
  rateChanges,
}: {
  analysis: LoanAnalysis;
  currentRate: number;
  rateChanges: RateChange[];
}) {
  const chart = buildRateTrajectory(analysis, currentRate, rateChanges);

  return (
    <svg
      aria-label="Floating home loan rate trajectory"
      className="w-full"
      role="img"
      viewBox={`0 0 ${chart.width} ${chart.height}`}
    >
      <defs>
        <linearGradient id="rate-area" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--tangerine)" stopOpacity="0.22" />
          <stop offset="100%" stopColor="var(--tangerine)" stopOpacity="0.02" />
        </linearGradient>
      </defs>
      {chart.yTicks.map((tick) => (
        <g key={tick.label}>
          <line
            stroke="var(--hairline)"
            strokeDasharray="2 5"
            x1={chart.padLeft}
            x2={chart.width - chart.padRight}
            y1={tick.y}
            y2={tick.y}
          />
          <text
            className="svg-muted svg-tiny"
            textAnchor="end"
            x={chart.padLeft - 8}
            y={tick.y + 3}
          >
            {tick.label}
          </text>
        </g>
      ))}
      <path d={chart.areaPath} fill="url(#rate-area)" />
      <path
        d={chart.linePath}
        fill="none"
        stroke="var(--tangerine)"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="3"
      />
      {chart.points.map((point) => (
        <g key={`${point.index}-${point.rate}`}>
          <circle
            cx={point.x}
            cy={point.y}
            fill="var(--surface)"
            r="5"
            stroke="var(--tangerine)"
            strokeWidth="2.5"
          />
          <text className="svg-value" textAnchor="middle" x={point.x} y={point.y - 11}>
            {point.rate.toFixed(2)}%
          </text>
        </g>
      ))}
    </svg>
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`mt-1 text-lg font-extrabold ${accent ? 'text-[var(--jade)]' : ''}`}>
        {value}
      </div>
    </div>
  );
}

function buildRateTrajectory(
  analysis: LoanAnalysis,
  currentRate: number,
  rateChanges: RateChange[],
) {
  const width = 420;
  const height = 210;
  const padLeft = 38;
  const padRight = 18;
  const padTop = 28;
  const padBottom = 28;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;
  const startDate = analysis.original.rows[0]?.date ?? '';
  const startRate = analysis.original.rows[0]?.rate ?? currentRate;
  const maxIndex = analysis.actual.summary.totalMonths;
  const rates = [startRate, ...rateChanges.map((item) => item.rate), currentRate];
  const minRate = Math.floor(Math.min(...rates) * 2) / 2;
  const maxRate = Math.ceil(Math.max(...rates) * 2) / 2;
  const x = (index: number) => padLeft + (index / maxIndex) * innerWidth;
  const y = (rate: number) =>
    padTop + innerHeight - ((rate - minRate) / (maxRate - minRate || 1)) * innerHeight;
  const points = [
    { index: 1, rate: startRate },
    ...rateChanges.map((item) => ({
      index: getEffectiveMonthIndex(item.date, startDate, 'rate'),
      rate: item.rate,
    })),
    { index: maxIndex, rate: currentRate },
  ].map((point) => ({ ...point, x: x(point.index), y: y(point.rate) }));
  const linePath = points
    .map((point, index) => `${index === 0 ? 'M' : 'L'} ${point.x} ${point.y}`)
    .join(' ');
  const areaPath = `${linePath} L ${points.at(-1)?.x ?? padLeft} ${y(minRate)} L ${
    points[0]?.x ?? padLeft
  } ${y(minRate)} Z`;

  return {
    areaPath,
    height,
    linePath,
    padLeft,
    padRight,
    points,
    width,
    yTicks: [minRate, (minRate + maxRate) / 2, maxRate].map((rate) => ({
      label: formatPercent(rate),
      y: y(rate),
    })),
  };
}

function updateRate(
  rateChanges: RateChange[],
  index: number,
  patch: Partial<RateChange>,
  onChange: (rateChanges: RateChange[]) => void,
): void {
  onChange(
    sortRates(
      rateChanges.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
    ),
  );
}

function removeRate(
  rateChanges: RateChange[],
  index: number,
  onChange: (rateChanges: RateChange[]) => void,
): void {
  onChange(rateChanges.filter((_, itemIndex) => itemIndex !== index));
}

function sortRates(rateChanges: RateChange[]): RateChange[] {
  return [...rateChanges].sort((left, right) => left.date.localeCompare(right.date));
}
