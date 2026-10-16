import { useMemo, useState, type PointerEvent } from 'react';

import {
  getEffectiveMonthIndex,
  type EventImpact,
  type LoanAnalysis,
  type ScheduleRow,
} from '../features/loan/loanEngine';
import { formatDuration, formatInr, formatInrShort, formatMonthYear } from '../utils/format';

type BalanceChartProps = {
  analysis: LoanAnalysis;
};

type ChartPoint = {
  index: number;
  balance: number;
};

type ChartScale = {
  height: number;
  innerHeight: number;
  innerWidth: number;
  padBottom: number;
  padLeft: number;
  padRight: number;
  padTop: number;
  width: number;
  x: (index: number) => number;
  y: (value: number) => number;
};

type EventMarker = {
  ariaLabel: string;
  color: string;
  index: number;
  kind: 'rate' | 'prepayment';
  label: string;
  x: number;
  y: number;
};

type BalanceReadout = {
  actualBalance: number;
  date: string;
  emi: number;
  originalBalance: number;
  savings: number;
  x: number;
  yActual: number;
  yOriginal: number;
};

/**
 * Renders original vs current outstanding balance with savings, payoff, and event annotations.
 *
 * @param props - Balance chart props.
 * @param props.analysis - Loan analysis containing original and actual schedules.
 * @returns Responsive balance chart element.
 */
export function BalanceChart({ analysis }: BalanceChartProps) {
  const chart = useMemo(() => buildBalanceChart(analysis), [analysis]);
  const [activeIndex, setActiveIndex] = useState(
    Math.min(analysis.todayIndex, analysis.actual.summary.totalMonths),
  );
  const activeReadout = buildBalanceReadout(analysis, chart.scale, activeIndex);

  return (
    <div className="interactive-chart">
      <BalanceReadoutPanel readout={activeReadout} />
      <div className="chart-scroll">
        <svg
          aria-label="Outstanding balance with rate and prepayment annotations"
          className="w-full"
          role="img"
          viewBox={`0 0 ${chart.scale.width} ${chart.scale.height}`}
        >
          <defs>
            <pattern
              id="savings-stripe"
              patternTransform="rotate(45)"
              patternUnits="userSpaceOnUse"
              width="7"
              height="7"
            >
              <rect width="7" height="7" fill="rgba(22, 148, 106, 0.1)" />
              <line stroke="rgba(22, 148, 106, 0.36)" strokeWidth="1" x1="0" x2="0" y1="0" y2="7" />
            </pattern>
          </defs>

          <ChartGrid scale={chart.scale} ticks={chart.yTicks} years={chart.yearTicks} />
          <path d={chart.savingsPath} fill="url(#savings-stripe)" />
          <TodayMarker scale={chart.scale} todayIndex={analysis.todayIndex} />
          <path
            d={chart.originalPath}
            fill="none"
            stroke="#949596"
            strokeDasharray="6 5"
            strokeLinecap="round"
            strokeWidth="2"
          />
          <path
            d={chart.actualPath}
            fill="none"
            stroke="var(--primary)"
            strokeLinecap="round"
            strokeWidth="3.5"
          />
          <rect
            aria-label="Balance chart focus area"
            className="chart-hit-target"
            fill="transparent"
            height={chart.scale.innerHeight}
            role="presentation"
            width={chart.scale.innerWidth}
            x={chart.scale.padLeft}
            y={chart.scale.padTop}
            onPointerMove={(event) =>
              setActiveIndex(
                pointerIndexFromEvent(event, chart.scale, analysis.actual.summary.totalMonths),
              )
            }
          />
          <ActiveBalanceOverlay readout={activeReadout} scale={chart.scale} />
          <PayoffCallouts
            actualIndex={analysis.actual.summary.totalMonths}
            actualPayoff={analysis.actual.summary.payoffDate}
            duration={formatDuration(analysis.monthsSaved)}
            originalIndex={analysis.original.summary.totalMonths}
            originalPayoff={analysis.original.summary.payoffDate}
            scale={chart.scale}
          />
          {chart.markers.map((marker) => (
            <EventDot
              key={`${marker.kind}-${marker.label}-${marker.x}`}
              marker={marker}
              onActivate={setActiveIndex}
            />
          ))}
          <BalanceLegend scale={chart.scale} />
        </svg>
      </div>
    </div>
  );
}

function BalanceReadoutPanel({ readout }: { readout: BalanceReadout }) {
  return (
    <div className="chart-readout" aria-live="polite">
      <div>
        <span>Month</span>
        <strong>{formatMonthYear(readout.date)}</strong>
      </div>
      <div>
        <span>Actual balance</span>
        <strong>{formatInrShort(readout.actualBalance)}</strong>
      </div>
      <div>
        <span>If nothing changed</span>
        <strong>{formatInrShort(readout.originalBalance)}</strong>
      </div>
      <div>
        <span>Savings gap</span>
        <strong>{formatInrShort(readout.savings)}</strong>
      </div>
      <div>
        <span>EMI</span>
        <strong>{formatInr(readout.emi)}</strong>
      </div>
    </div>
  );
}

function ActiveBalanceOverlay({ readout, scale }: { readout: BalanceReadout; scale: ChartScale }) {
  return (
    <g className="chart-active-overlay">
      <line
        stroke="var(--primary)"
        strokeDasharray="4 4"
        strokeOpacity="0.72"
        x1={readout.x}
        x2={readout.x}
        y1={scale.padTop}
        y2={scale.height - scale.padBottom}
      />
      <circle
        cx={readout.x}
        cy={readout.yOriginal}
        fill="var(--surface)"
        r="4"
        stroke="#949596"
        strokeWidth="2"
      />
      <circle
        cx={readout.x}
        cy={readout.yActual}
        fill="var(--surface)"
        r="6"
        stroke="var(--primary)"
        strokeWidth="2.5"
      />
      <circle cx={readout.x} cy={readout.yActual} fill="var(--primary)" r="2.6" />
    </g>
  );
}

function pointerIndexFromEvent(
  event: PointerEvent<SVGRectElement>,
  scale: ChartScale,
  maxIndex: number,
): number {
  const bounds = event.currentTarget.getBoundingClientRect();
  const chartX = ((event.clientX - bounds.left) / bounds.width) * scale.innerWidth;
  const rawIndex = Math.round((chartX / scale.innerWidth) * maxIndex);

  return clamp(rawIndex, 1, maxIndex);
}

function buildBalanceReadout(
  analysis: LoanAnalysis,
  scale: ChartScale,
  activeIndex: number,
): BalanceReadout {
  const index = clamp(activeIndex, 1, analysis.actual.summary.totalMonths);
  const actualRow = rowAtIndex(analysis.actual.rows, index);
  const originalRow = rowAtIndex(analysis.original.rows, index);
  const actualBalance = actualRow?.closingBalance ?? 0;
  const originalBalance = originalRow?.closingBalance ?? 0;
  const date = actualRow?.date ?? originalRow?.date ?? analysis.actual.summary.payoffDate;

  return {
    actualBalance,
    date,
    emi: actualRow?.emi ?? analysis.actual.summary.baseEmi,
    originalBalance,
    savings: Math.max(0, originalBalance - actualBalance),
    x: scale.x(index),
    yActual: scale.y(actualBalance),
    yOriginal: scale.y(originalBalance),
  };
}

function rowAtIndex(rows: ScheduleRow[], index: number): ScheduleRow | undefined {
  return rows[index - 1];
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

type MoneyDonutProps = {
  analysis: LoanAnalysis;
};

/**
 * Renders principal, prepayment, and interest lifetime split.
 *
 * @param props - Donut chart props.
 * @param props.analysis - Loan analysis containing actual schedule totals.
 * @returns Responsive donut chart with legend.
 */
export function MoneyDonut({ analysis }: MoneyDonutProps) {
  const summary = analysis.actual.summary;
  const data = [
    {
      name: 'Principal through EMIs',
      value: summary.principalFromEmi,
      color: 'var(--primary)',
    },
    { name: 'Prepayments', value: summary.totalPrepayment, color: 'var(--violet)' },
    { name: 'Interest', value: summary.totalInterest, color: 'var(--tangerine)' },
  ];

  return (
    <div className="grid place-items-center gap-5">
      <div className="relative h-[230px] w-[230px]">
        <svg className="h-full w-full -rotate-90" viewBox="0 0 230 230">
          <circle cx="115" cy="115" fill="none" r="76" stroke="var(--surface-3)" strokeWidth="28" />
          {buildDonutSegments(data, 76).map((segment) => (
            <circle
              cx="115"
              cy="115"
              fill="none"
              key={segment.name}
              r="76"
              stroke={segment.color}
              strokeDasharray={segment.dashArray}
              strokeDashoffset={segment.dashOffset}
              strokeLinecap="butt"
              strokeWidth="28"
            />
          ))}
        </svg>
        <div className="absolute inset-0 grid place-items-center text-center">
          <div>
            <div className="label">Total outflow</div>
            <div className="text-3xl font-extrabold">
              {formatInrShort(summary.totalPrincipal + summary.totalInterest)}
            </div>
          </div>
        </div>
      </div>
      <div className="grid w-full gap-2">
        {data.map((item) => (
          <div
            className="flex items-center justify-between rounded-lg bg-[var(--surface-2)] px-3 py-2"
            key={item.name}
          >
            <span className="flex items-center gap-2 text-sm">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: item.color }} />
              {item.name}
            </span>
            <strong>{formatInrShort(item.value)}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

type ImpactBarChartProps = {
  events: EventImpact[];
};

/**
 * Renders months saved per event with distinct rate and prepayment bars.
 *
 * @param props - Impact chart props.
 * @param props.events - Event impact rows.
 * @returns SVG bar chart element.
 */
export function ImpactBarChart({ events }: ImpactBarChartProps) {
  const chart = buildImpactChart(events);

  return (
    <div className="chart-scroll">
      <svg
        aria-label="Months saved per loan event"
        className="w-full"
        role="img"
        viewBox={`0 0 ${chart.width} ${chart.height}`}
      >
        <text className="svg-label" x={chart.padLeft} y="16">
          MONTHS SAVED
        </text>
        {chart.grid.map((line) => (
          <g key={line.value}>
            <line
              stroke="var(--hairline)"
              strokeDasharray="2 5"
              x1={chart.padLeft}
              x2={chart.width - chart.padRight}
              y1={line.y}
              y2={line.y}
            />
            <text className="svg-muted" textAnchor="end" x={chart.padLeft - 8} y={line.y + 4}>
              {line.value}
            </text>
          </g>
        ))}
        {chart.bars.map((bar) => (
          <g data-impact-kind={bar.kind} key={`${bar.kind}-${bar.date}`}>
            <rect
              fill={bar.color}
              height={bar.height}
              opacity="0.92"
              rx="4"
              width={bar.width}
              x={bar.x}
              y={bar.y}
            />
            <text className="svg-value" textAnchor="middle" x={bar.x + bar.width / 2} y={bar.y - 7}>
              {bar.monthsSaved}
            </text>
            <text
              className="svg-muted"
              textAnchor="middle"
              x={bar.x + bar.width / 2}
              y={chart.height - chart.padBottom + 18}
            >
              {bar.label}
            </text>
            <text
              className="svg-muted svg-tiny"
              textAnchor="middle"
              x={bar.x + bar.width / 2}
              y={chart.height - chart.padBottom + 32}
            >
              {formatMonthYear(bar.date)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

type PaymentHeatmapProps = {
  rows: ScheduleRow[];
};

/**
 * Renders a year/month heatmap of scheduled principal and prepayments.
 *
 * @param props - Heatmap props.
 * @param props.rows - Schedule rows to visualize.
 * @returns Payment heatmap element.
 */
export function PaymentHeatmap({ rows }: PaymentHeatmapProps) {
  const years = Array.from(new Set(rows.map((row) => Number(row.date.slice(0, 4)))));
  const maxPrincipal = Math.max(...rows.map((row) => row.principal + row.prepayment), 1);

  return (
    <div className="overflow-auto">
      <div className="heatmap min-w-[760px]">
        <div />
        {'JFMAMJJASOND'.split('').map((month, index) => (
          <div className="subtle text-center text-xs font-bold" key={`${month}-${index}`}>
            {month}
          </div>
        ))}
        {years.map((year) => (
          <HeatmapYear key={year} year={year} rows={rows} maxPrincipal={maxPrincipal} />
        ))}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-4 text-xs font-semibold text-[var(--ink-3)]">
        <span>Principal repaid intensity</span>
        <span className="flex gap-1">
          {[0.2, 0.4, 0.6, 0.8, 1].map((opacity) => (
            <span
              className="h-3.5 w-3.5 rounded-[3px]"
              key={opacity}
              style={{ background: `rgba(255, 225, 90, ${opacity})` }}
            />
          ))}
        </span>
        <span className="inline-flex items-center gap-2">
          <span className="grid h-4 w-4 place-items-center rounded-[3px] bg-[var(--violet)] text-[10px] text-white">
            ★
          </span>
          Part-payment month
        </span>
      </div>
    </div>
  );
}

type HeatmapYearProps = {
  year: number;
  rows: ScheduleRow[];
  maxPrincipal: number;
};

function HeatmapYear({ year, rows, maxPrincipal }: HeatmapYearProps) {
  const rowsByMonth = new Map(
    rowsForYear(rows, year).map((row) => [Number(row.date.slice(5, 7)), row]),
  );

  return (
    <>
      <div className="subtle flex items-center text-xs font-bold">{year}</div>
      {Array.from({ length: 12 }, (_, index) => {
        const row = rowsByMonth.get(index + 1);
        return <HeatmapCell key={index} row={row} maxPrincipal={maxPrincipal} />;
      })}
    </>
  );
}

function HeatmapCell({
  row,
  maxPrincipal,
}: {
  row: ScheduleRow | undefined;
  maxPrincipal: number;
}) {
  if (row === undefined) {
    return <div className="heat-cell opacity-25" />;
  }

  const intensity = Math.max(0.18, (row.principal + row.prepayment) / maxPrincipal);
  const color = row.prepayment > 0 ? '151, 71, 255' : '255, 225, 90';

  return (
    <div
      className="heat-cell"
      title={`${formatMonthYear(row.date)}: ${formatInrShort(row.principal + row.prepayment)}`}
      style={{ background: `rgba(${color}, ${intensity})` }}
    >
      {row.prepayment > 0 ? '★' : ''}
    </div>
  );
}

function ChartGrid({
  scale,
  ticks,
  years,
}: {
  scale: ChartScale;
  ticks: Array<{ label: string; value: number }>;
  years: Array<{ index: number; label: string }>;
}) {
  return (
    <>
      {ticks.map((tick) => (
        <g key={tick.value}>
          <line
            stroke="var(--hairline)"
            strokeDasharray={tick.value === 0 ? undefined : '2 5'}
            x1={scale.padLeft}
            x2={scale.width - scale.padRight}
            y1={scale.y(tick.value)}
            y2={scale.y(tick.value)}
          />
          <text
            className="svg-muted"
            textAnchor="end"
            x={scale.padLeft - 10}
            y={scale.y(tick.value) + 4}
          >
            {tick.label}
          </text>
        </g>
      ))}
      {years.map((year) => (
        <g key={year.label}>
          <line
            stroke="var(--hairline)"
            strokeOpacity="0.55"
            x1={scale.x(year.index)}
            x2={scale.x(year.index)}
            y1={scale.padTop}
            y2={scale.height - scale.padBottom}
          />
          <text
            className="svg-muted"
            textAnchor="middle"
            x={scale.x(year.index)}
            y={scale.height - scale.padBottom + 20}
          >
            {year.label}
          </text>
        </g>
      ))}
    </>
  );
}

function TodayMarker({ scale, todayIndex }: { scale: ChartScale; todayIndex: number }) {
  const x = scale.x(todayIndex);

  return (
    <g>
      <line
        stroke="var(--teal-deep)"
        strokeDasharray="3 4"
        strokeWidth="1.5"
        x1={x}
        x2={x}
        y1={scale.padTop}
        y2={scale.height - scale.padBottom}
      />
      <rect
        fill="var(--teal-deep)"
        height="16"
        rx="3"
        width="46"
        x={x - 23}
        y={scale.padTop - 20}
      />
      <text className="svg-now" textAnchor="middle" x={x} y={scale.padTop - 8}>
        NOW
      </text>
    </g>
  );
}

function PayoffCallouts({
  actualIndex,
  actualPayoff,
  duration,
  originalIndex,
  originalPayoff,
  scale,
}: {
  actualIndex: number;
  actualPayoff: string;
  duration: string;
  originalIndex: number;
  originalPayoff: string;
  scale: ChartScale;
}) {
  const actualX = scale.x(actualIndex);
  const originalX = scale.x(originalIndex);
  const baselineY = scale.y(0);
  const midX = (actualX + originalX) / 2;

  return (
    <g>
      <circle cx={originalX} cy={baselineY} fill="#949596" r="4" />
      <text className="svg-muted" textAnchor="middle" x={originalX} y={baselineY + 28}>
        {formatMonthYear(originalPayoff)}
      </text>
      <circle
        cx={actualX}
        cy={baselineY}
        fill="var(--surface)"
        r="6"
        stroke="var(--primary)"
        strokeWidth="2.5"
      />
      <circle cx={actualX} cy={baselineY} fill="var(--primary)" r="2.5" />
      <rect
        fill="var(--primary)"
        height="24"
        rx="4"
        width="74"
        x={actualX - 37}
        y={baselineY - 42}
      />
      <text className="svg-callout" textAnchor="middle" x={actualX} y={baselineY - 25}>
        {formatMonthYear(actualPayoff)}
      </text>
      <line
        stroke="var(--jade)"
        strokeWidth="1.5"
        x1={actualX + 10}
        x2={originalX - 10}
        y1={baselineY + 10}
        y2={baselineY + 10}
      />
      <rect fill="var(--jade)" height="20" rx="10" width="112" x={midX - 56} y={baselineY + 20} />
      <text className="svg-callout" textAnchor="middle" x={midX} y={baselineY + 34}>
        {duration} earlier
      </text>
    </g>
  );
}

function EventDot({
  marker,
  onActivate,
}: {
  marker: EventMarker;
  onActivate: (index: number) => void;
}) {
  return (
    <g
      aria-label={marker.ariaLabel}
      className="chart-event-dot"
      data-event-kind={marker.kind}
      role="button"
      tabIndex={0}
      onFocus={() => onActivate(marker.index)}
      onKeyDown={(event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          onActivate(marker.index);
        }
      }}
      onPointerEnter={() => onActivate(marker.index)}
    >
      <title>{`${marker.kind}: ${marker.label}`}</title>
      <circle
        className="chart-event-ring"
        cx={marker.x}
        cy={marker.y}
        fill="var(--surface)"
        r="6"
        stroke={marker.color}
        strokeWidth="2.5"
      />
      <circle cx={marker.x} cy={marker.y} fill={marker.color} r="2.8" />
    </g>
  );
}

function BalanceLegend({ scale }: { scale: ChartScale }) {
  const y = scale.padTop - 34;

  return (
    <g>
      <line
        stroke="var(--primary)"
        strokeLinecap="round"
        strokeWidth="3.5"
        x1={scale.padLeft}
        x2={scale.padLeft + 22}
        y1={y}
        y2={y}
      />
      <text className="svg-legend" x={scale.padLeft + 28} y={y + 4}>
        Your actual balance
      </text>
      <line
        stroke="#949596"
        strokeDasharray="6 5"
        strokeWidth="2"
        x1={scale.padLeft + 160}
        x2={scale.padLeft + 184}
        y1={y}
        y2={y}
      />
      <text className="svg-legend muted" x={scale.padLeft + 190} y={y + 4}>
        If nothing had changed
      </text>
      <rect
        fill="url(#savings-stripe)"
        height="12"
        stroke="rgba(22, 148, 106, 0.4)"
        width="16"
        x={scale.padLeft + 348}
        y={y - 7}
      />
      <text className="svg-legend muted" x={scale.padLeft + 370} y={y + 4}>
        Savings
      </text>
      <circle
        cx={scale.padLeft + 438}
        cy={y}
        fill="var(--surface)"
        r="4"
        stroke="var(--tangerine)"
        strokeWidth="2"
      />
      <text className="svg-legend muted" x={scale.padLeft + 448} y={y + 4}>
        Rate drop
      </text>
      <circle
        cx={scale.padLeft + 526}
        cy={y}
        fill="var(--surface)"
        r="4"
        stroke="var(--violet)"
        strokeWidth="2"
      />
      <text className="svg-legend muted" x={scale.padLeft + 536} y={y + 4}>
        Prepayment
      </text>
    </g>
  );
}

function buildBalanceChart(analysis: LoanAnalysis) {
  const actual = buildBalancePoints(analysis.actual.rows);
  const original = buildBalancePoints(analysis.original.rows);
  const maxBalance = Math.max(...original.map((point) => point.balance), 1);
  const scale = createScale(820, 470, analysis.original.summary.totalMonths, maxBalance);
  const gapTop = original.slice(0, actual.length);
  const savingsPath = areaPath([...gapTop, ...[...actual].reverse()], scale);
  const startDate = analysis.original.rows[0]?.date ?? '';

  return {
    actualPath: linePath(actual, scale),
    markers: buildEventMarkers(analysis, scale, startDate),
    originalPath: linePath(original, scale),
    savingsPath,
    scale,
    yearTicks: buildYearTicks(analysis.original.summary.totalMonths, startDate),
    yTicks: buildYTicks(maxBalance),
  };
}

function buildBalancePoints(rows: ScheduleRow[]): ChartPoint[] {
  const first = rows[0];

  if (first === undefined) {
    return [];
  }

  return [
    { index: 0, balance: first.openingBalance },
    ...rows.map((row) => ({ index: row.index, balance: row.closingBalance })),
  ];
}

function buildEventMarkers(
  analysis: LoanAnalysis,
  scale: ChartScale,
  startDate: string,
): EventMarker[] {
  const rateMarkers = analysis.rateImpacts.map((event) =>
    createEventMarker(event, 'rate', scale, analysis.actual.rows, startDate),
  );
  const prepaymentMarkers = analysis.partPaymentImpacts.map((event) =>
    createEventMarker(event, 'prepayment', scale, analysis.actual.rows, startDate),
  );

  return [...rateMarkers, ...prepaymentMarkers];
}

function createEventMarker(
  event: EventImpact,
  kind: 'rate' | 'prepayment',
  scale: ChartScale,
  rows: ScheduleRow[],
  startDate: string,
): EventMarker {
  const eventKind = kind === 'rate' ? 'rate' : 'partPayment';
  const monthIndex = getEffectiveMonthIndex(event.date, startDate, eventKind);
  const row = rows.find((item) => item.index === monthIndex) ?? rows.at(-1);
  const label = eventLabel(event);

  return {
    ariaLabel: `${kind === 'rate' ? 'Rate change' : 'Prepayment'} ${label} in ${formatMonthYear(
      row?.date ?? event.date,
    )}`,
    color: kind === 'rate' ? 'var(--tangerine)' : 'var(--violet)',
    index: monthIndex,
    kind,
    label,
    x: scale.x(monthIndex),
    y: scale.y(row?.closingBalance ?? 0),
  };
}

function eventLabel(event: EventImpact): string {
  if ('rate' in event && typeof event.rate === 'number') {
    return `${event.rate.toFixed(2)}%`;
  }

  if ('amount' in event && typeof event.amount === 'number') {
    return formatInrShort(event.amount);
  }

  return formatDuration(event.monthsSaved);
}

function createScale(
  width: number,
  height: number,
  maxIndex: number,
  maxBalance: number,
): ChartScale {
  const padLeft = 68;
  const padRight = 42;
  const padTop = 60;
  const padBottom = 58;
  const innerWidth = width - padLeft - padRight;
  const innerHeight = height - padTop - padBottom;

  return {
    height,
    innerHeight,
    innerWidth,
    padBottom,
    padLeft,
    padRight,
    padTop,
    width,
    x: (index) => padLeft + (index / maxIndex) * innerWidth,
    y: (value) => padTop + innerHeight - (value / maxBalance) * innerHeight,
  };
}

function buildYTicks(maxBalance: number): Array<{ label: string; value: number }> {
  return [0, 0.25, 0.5, 0.75, 1].map((ratio) => {
    const value = maxBalance * ratio;
    return {
      label: ratio === 0 ? '₹0' : formatInrShort(value),
      value,
    };
  });
}

function buildYearTicks(
  maxIndex: number,
  startDate: string,
): Array<{ index: number; label: string }> {
  const ticks: Array<{ index: number; label: string }> = [];
  const [startYear = 0, startMonth = 1] = startDate.split('-').map(Number);
  const firstJanuaryIndex = 1 + ((13 - startMonth) % 12);
  const firstJanuaryYear = startMonth === 1 ? startYear : startYear + 1;

  for (let index = firstJanuaryIndex; index < maxIndex; index += 12) {
    const year = firstJanuaryYear + Math.floor((index - firstJanuaryIndex) / 12);
    ticks.push({ index, label: `'${String(year).slice(2)}` });
  }

  return ticks;
}

function linePath(points: ChartPoint[], scale: ChartScale): string {
  return points
    .map(
      (point, index) =>
        `${index === 0 ? 'M' : 'L'} ${scale.x(point.index)} ${scale.y(point.balance)}`,
    )
    .join(' ');
}

function areaPath(points: ChartPoint[], scale: ChartScale): string {
  return `${linePath(points, scale)} Z`;
}

function buildDonutSegments(
  data: Array<{ name: string; value: number; color: string }>,
  radius: number,
) {
  const circumference = 2 * Math.PI * radius;
  const total = data.reduce((sum, item) => sum + item.value, 0);
  let offset = 0;

  return data.map((item) => {
    const length = total > 0 ? (item.value / total) * circumference : 0;
    const segment = {
      ...item,
      dashArray: `${length} ${circumference - length}`,
      dashOffset: -offset,
    };

    offset += length;
    return segment;
  });
}

function buildImpactChart(events: EventImpact[]) {
  const width = 540;
  const height = 245;
  const padLeft = 34;
  const padRight = 20;
  const padTop = 32;
  const padBottom = 56;
  const maxMonths = Math.max(...events.map((event) => event.monthsSaved), 1);
  const chartHeight = height - padTop - padBottom;
  const gap = 8;
  const barWidth = (width - padLeft - padRight - gap * (events.length - 1)) / events.length;

  return {
    bars: events.map((event, index) =>
      buildImpactBar(event, index, maxMonths, {
        barWidth,
        chartHeight,
        gap,
        height,
        padBottom,
        padLeft,
        padTop,
      }),
    ),
    grid: [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      value: Math.round(maxMonths * ratio),
      y: padTop + chartHeight - chartHeight * ratio,
    })),
    height,
    padBottom,
    padLeft,
    padRight,
    width,
  };
}

function buildImpactBar(
  event: EventImpact,
  index: number,
  maxMonths: number,
  layout: {
    barWidth: number;
    chartHeight: number;
    gap: number;
    height: number;
    padBottom: number;
    padLeft: number;
    padTop: number;
  },
) {
  const kind = 'amount' in event ? 'prepayment' : 'rate';
  const height = (event.monthsSaved / maxMonths) * layout.chartHeight;
  const x = layout.padLeft + index * (layout.barWidth + layout.gap);

  return {
    color: kind === 'rate' ? 'var(--tangerine)' : 'var(--violet)',
    date: event.date,
    height,
    kind,
    label: eventLabel(event),
    monthsSaved: event.monthsSaved,
    width: layout.barWidth,
    x,
    y: layout.padTop + layout.chartHeight - height,
  };
}

function rowsForYear(rows: ScheduleRow[], year: number): ScheduleRow[] {
  return rows.filter((row) => Number(row.date.slice(0, 4)) === year);
}
