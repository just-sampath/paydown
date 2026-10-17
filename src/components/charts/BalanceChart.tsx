import { useMemo, useState, type KeyboardEvent, type PointerEvent } from 'react';

import {
  getEffectiveMonthIndex,
  type LoanAnalysis,
  type ScheduleRow,
} from '../../features/loan/loanEngine';
import { formatInrShort, formatMonthYear, formatPercent } from '../../utils/format';
import { clamp, useChartWidth, yearTicks } from './chartUtils';

type BalanceChartProps = {
  analysis: LoanAnalysis;
};

type Point = { index: number; balance: number };

type Marker = {
  kind: 'rate' | 'prepayment';
  index: number;
  title: string;
  x: number;
  y: number;
};

const PAD = { left: 58, right: 20, top: 30, bottom: 58 };

/**
 * Outstanding balance on the current plan against the original plan, with today's
 * position, every rate change and part payment, and both payoff dates.
 *
 * Hover, drag, or use the arrow keys to read any month. At rest the readout only says how
 * far today's balance is from the original plan, so it never repeats the balance the
 * progress card already shows.
 *
 * @param props - Chart props.
 * @param props.analysis - Loan analysis with original and actual schedules.
 * @returns Interactive balance chart.
 */
export function BalanceChart({ analysis }: BalanceChartProps) {
  const [ref, width] = useChartWidth(760);
  const chart = useMemo(() => buildBalanceChart(analysis, width), [analysis, width]);
  const todayIndex = clamp(analysis.todayIndex, 1, chart.maxIndex);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);
  const activeIndex = focusIndex ?? todayIndex;
  const readout = buildReadout(analysis, activeIndex);
  const today = buildReadout(analysis, todayIndex);

  const moveTo = (event: PointerEvent<SVGRectElement>): void => {
    const bounds = event.currentTarget.getBoundingClientRect();
    const ratio = (event.clientX - bounds.left) / Math.max(bounds.width, 1);
    setFocusIndex(clamp(Math.round(ratio * chart.maxIndex), 1, chart.maxIndex));
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const next = keyboardIndex(event.key, activeIndex, chart.maxIndex);
    if (next !== undefined) {
      event.preventDefault();
      setFocusIndex(next);
    }
  };

  return (
    <div>
      <div className="chart-readout" aria-live="polite">
        {focusIndex === null ? (
          <p className="chart-readout-note">
            {analysis.todayIndex > 0 && <>{restingSummary(today.original - today.actual)} </>}
            Point at the chart or use the arrow keys to read any month.
          </p>
        ) : (
          <>
            <div>
              <span>Month</span>
              <strong>{formatMonthYear(readout.date)}</strong>
            </div>
            <div>
              <span>Your balance</span>
              <strong>{formatInrShort(readout.actual)}</strong>
            </div>
            <div>
              <span>Original plan</span>
              <strong>{formatInrShort(readout.original)}</strong>
            </div>
            <div>
              <span>Difference</span>
              <strong className={differenceTone(readout.original - readout.actual)}>
                {differenceLabel(readout.original - readout.actual)}
              </strong>
            </div>
          </>
        )}
      </div>
      <div
        aria-label="Balance chart. Use the left and right arrow keys to move between months."
        className="chart-box chart-focus"
        ref={ref}
        role="group"
        tabIndex={0}
        onBlur={() => setFocusIndex(null)}
        onFocus={() => setFocusIndex((index) => index ?? todayIndex)}
        onKeyDown={onKeyDown}
      >
        <svg
          aria-hidden="true"
          height={chart.height}
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          width={chart.width}
        >
          <BalanceGrid chart={chart} />
          <path
            d={chart.gapPath}
            fill={chart.ahead ? 'var(--c-positive)' : 'var(--c-negative)'}
            opacity="0.13"
          />
          <path
            d={chart.originalPath}
            fill="none"
            stroke="var(--c-baseline)"
            strokeDasharray="6 5"
            strokeWidth="2"
          />
          <path
            d={chart.actualPath}
            fill="none"
            stroke="var(--c-principal)"
            strokeLinejoin="round"
            strokeWidth="3"
          />
          {analysis.todayIndex > 0 && <TodayMarker chart={chart} index={todayIndex} />}
          <PayoffMarkers analysis={analysis} chart={chart} />
          {chart.markers.map((marker) => (
            <circle
              cx={marker.x}
              cy={marker.y}
              data-event-kind={marker.kind}
              fill="var(--surface)"
              key={`${marker.kind}-${marker.index}-${marker.title}`}
              r="5"
              stroke={marker.kind === 'rate' ? 'var(--c-rate)' : 'var(--c-prepay)'}
              strokeWidth="2.5"
            >
              <title>{marker.title}</title>
            </circle>
          ))}
          {focusIndex !== null && (
            <ActiveMarker chart={chart} index={activeIndex} readout={readout} />
          )}
          <rect
            className="cursor-crosshair"
            fill="transparent"
            height={chart.innerHeight}
            width={chart.innerWidth}
            x={PAD.left}
            y={PAD.top}
            onPointerDown={moveTo}
            onPointerLeave={() => setFocusIndex(null)}
            onPointerMove={moveTo}
          />
        </svg>
      </div>
      <ul className="legend">
        <li style={{ color: 'var(--c-principal)' }}>
          <span className="legend-line" />
          <span className="text-[var(--ink-2)]">Your loan</span>
        </li>
        <li style={{ color: 'var(--c-baseline)' }}>
          <span className="legend-line is-dashed" />
          <span className="text-[var(--ink-2)]">Original plan</span>
        </li>
        <li style={{ color: 'var(--c-rate)' }}>
          <span className="legend-dot" />
          <span className="text-[var(--ink-2)]">Rate change</span>
        </li>
        <li style={{ color: 'var(--c-prepay)' }}>
          <span className="legend-dot" />
          <span className="text-[var(--ink-2)]">Part payment</span>
        </li>
      </ul>
    </div>
  );
}

type BalanceChartLayout = ReturnType<typeof buildBalanceChart>;

function BalanceGrid({ chart }: { chart: BalanceChartLayout }) {
  return (
    <g>
      {chart.yTicks.map((tick) => (
        <g key={tick.value}>
          <line
            stroke="var(--hairline-strong)"
            strokeDasharray={tick.value === 0 ? undefined : '2 5'}
            x1={PAD.left}
            x2={chart.width - PAD.right}
            y1={chart.y(tick.value)}
            y2={chart.y(tick.value)}
          />
          <text className="svg-axis" textAnchor="end" x={PAD.left - 8} y={chart.y(tick.value) + 4}>
            {tick.label}
          </text>
        </g>
      ))}
      {chart.xTicks.map((tick) => (
        <text
          className="svg-axis"
          key={tick.index}
          textAnchor="middle"
          x={chart.x(tick.index)}
          y={chart.height - 12}
        >
          {tick.label}
        </text>
      ))}
    </g>
  );
}

function TodayMarker({ chart, index }: { chart: BalanceChartLayout; index: number }) {
  const x = chart.x(index);

  return (
    <g>
      <line
        stroke="var(--ink-3)"
        strokeDasharray="3 4"
        x1={x}
        x2={x}
        y1={PAD.top}
        y2={PAD.top + chart.innerHeight}
      />
      <rect fill="var(--ink-2)" height="18" rx="4" width="46" x={x - 23} y={PAD.top - 24} />
      <text
        className="svg-tag"
        style={{ fill: 'var(--surface)' }}
        textAnchor="middle"
        x={x}
        y={PAD.top - 11}
      >
        Today
      </text>
    </g>
  );
}

const ACTUAL_TAG_WIDTH = 70;
const ORIGINAL_TAG_WIDTH = 92;
const TAG_HEIGHT = 20;

/**
 * Tags both payoff points in their own row just under the axis, where no line can reach
 * them. The tags name the plan rather than repeat the dates the hero already shows; the
 * dates are in each tag's tooltip.
 */
function PayoffMarkers({ analysis, chart }: { analysis: LoanAnalysis; chart: BalanceChartLayout }) {
  const actualX = chart.x(analysis.actual.summary.totalMonths);
  const originalX = chart.x(analysis.original.summary.totalMonths);
  const baseline = chart.y(0);
  const tagY = baseline + 7;
  const right = chart.width - PAD.right;
  const debtTagX = clamp(actualX - ACTUAL_TAG_WIDTH / 2, PAD.left, right - ACTUAL_TAG_WIDTH);
  const originalTagX = clamp(
    originalX - ORIGINAL_TAG_WIDTH / 2,
    PAD.left,
    right - ORIGINAL_TAG_WIDTH,
  );
  const showOriginalTag =
    originalTagX >= debtTagX + ACTUAL_TAG_WIDTH + 6 ||
    debtTagX >= originalTagX + ORIGINAL_TAG_WIDTH + 6;

  return (
    <g>
      <g>
        <title>{`Original plan ends ${formatMonthYear(analysis.original.summary.payoffDate)}`}</title>
        <circle cx={originalX} cy={baseline} fill="var(--c-baseline)" r="4" />
        {showOriginalTag && (
          <>
            <rect
              fill="var(--surface)"
              height={TAG_HEIGHT}
              rx="4"
              stroke="var(--c-baseline)"
              width={ORIGINAL_TAG_WIDTH}
              x={originalTagX}
              y={tagY}
            />
            <text
              className="svg-axis"
              textAnchor="middle"
              x={originalTagX + ORIGINAL_TAG_WIDTH / 2}
              y={tagY + 14}
            >
              Original end
            </text>
          </>
        )}
      </g>
      <g>
        <title>{`Debt-free ${formatMonthYear(analysis.actual.summary.payoffDate)}`}</title>
        <circle
          cx={actualX}
          cy={baseline}
          fill="var(--surface)"
          r="6"
          stroke="var(--c-principal)"
          strokeWidth="3"
        />
        <rect
          fill="var(--c-principal)"
          height={TAG_HEIGHT}
          rx="4"
          width={ACTUAL_TAG_WIDTH}
          x={debtTagX}
          y={tagY}
        />
        <text
          className="svg-tag"
          textAnchor="middle"
          x={debtTagX + ACTUAL_TAG_WIDTH / 2}
          y={tagY + 14}
        >
          Debt-free
        </text>
      </g>
    </g>
  );
}

function ActiveMarker({
  chart,
  index,
  readout,
}: {
  chart: BalanceChartLayout;
  index: number;
  readout: Readout;
}) {
  const x = chart.x(index);

  return (
    <g pointerEvents="none">
      <line
        stroke="var(--c-principal)"
        strokeOpacity="0.55"
        x1={x}
        x2={x}
        y1={PAD.top}
        y2={PAD.top + chart.innerHeight}
      />
      <circle
        cx={x}
        cy={chart.y(readout.original)}
        fill="var(--surface)"
        r="4"
        stroke="var(--c-baseline)"
        strokeWidth="2"
      />
      <circle cx={x} cy={chart.y(readout.actual)} fill="var(--c-principal)" r="5" />
    </g>
  );
}

function buildBalanceChart(analysis: LoanAnalysis, width: number) {
  // The extra 24px holds the payoff tags under the axis.
  const height = Math.round(clamp(width * 0.46, 240, 340)) + 24;
  const innerWidth = width - PAD.left - PAD.right;
  const innerHeight = height - PAD.top - PAD.bottom;
  const maxIndex = Math.max(
    analysis.original.summary.totalMonths,
    analysis.actual.summary.totalMonths,
    1,
  );
  const maxBalance = Math.max(analysis.original.rows[0]?.openingBalance ?? 1, 1);
  const x = (index: number) => PAD.left + (index / maxIndex) * innerWidth;
  const y = (value: number) => PAD.top + innerHeight - (value / maxBalance) * innerHeight;
  const actual = balancePoints(analysis.actual.rows, maxIndex);
  const original = balancePoints(analysis.original.rows, maxIndex);
  const startDate = analysis.original.rows[0]?.date ?? '';
  const toPath = (points: Point[]) =>
    points
      .map((point, i) => `${i === 0 ? 'M' : 'L'} ${x(point.index)} ${y(point.balance)}`)
      .join(' ');

  return {
    width,
    height,
    innerWidth,
    innerHeight,
    maxIndex,
    x,
    y,
    ahead: analysis.monthsSaved >= 0,
    actualPath: toPath(trimAtPayoff(actual)),
    originalPath: toPath(trimAtPayoff(original)),
    gapPath: `${toPath([...original, ...[...actual].reverse()])} Z`,
    markers: buildMarkers(analysis, startDate, x, y),
    xTicks: yearTicks(startDate, 1, maxIndex, innerWidth / maxIndex),
    yTicks: [0, 0.25, 0.5, 0.75, 1].map((ratio) => ({
      value: maxBalance * ratio,
      label: ratio === 0 ? '₹0' : formatInrShort(maxBalance * ratio),
    })),
  };
}

/** Opening balance, then each closing balance, padded with zeros to the chart's end. */
function balancePoints(rows: ScheduleRow[], maxIndex: number): Point[] {
  const first = rows[0];

  if (first === undefined) {
    return [];
  }

  const points = [
    { index: 0, balance: first.openingBalance },
    ...rows.map((row) => ({ index: row.index, balance: row.closingBalance })),
  ];
  const last = points.at(-1)?.index ?? 0;

  return last < maxIndex ? [...points, { index: maxIndex, balance: 0 }] : points;
}

/** Drops the zero padding after payoff so a line stops where its loan ends. */
function trimAtPayoff(points: Point[]): Point[] {
  const payoff = points.findIndex((point) => point.index > 0 && point.balance <= 0);
  return payoff === -1 ? points : points.slice(0, payoff + 1);
}

function buildMarkers(
  analysis: LoanAnalysis,
  startDate: string,
  x: (index: number) => number,
  y: (value: number) => number,
): Marker[] {
  const balanceAt = (index: number) => analysis.actual.rows[index - 1]?.closingBalance ?? 0;
  const rates = analysis.rateImpacts.map((event) => {
    const index = getEffectiveMonthIndex(event.date, startDate, 'rate');
    return {
      kind: 'rate' as const,
      index,
      title: `Rate changed to ${formatPercent(event.rate)} in ${formatMonthYear(event.date)}`,
      x: x(index),
      y: y(balanceAt(index)),
    };
  });
  const prepayments = analysis.partPaymentImpacts.map((event) => {
    const index = getEffectiveMonthIndex(event.date, startDate, 'partPayment');
    return {
      kind: 'prepayment' as const,
      index,
      title: `Part payment of ${formatInrShort(event.amount)} in ${formatMonthYear(event.date)}`,
      x: x(index),
      y: y(balanceAt(index)),
    };
  });

  return [...rates, ...prepayments];
}

type Readout = { date: string; actual: number; original: number };

function buildReadout(analysis: LoanAnalysis, index: number): Readout {
  const actualRow = analysis.actual.rows[index - 1];
  const originalRow = analysis.original.rows[index - 1];

  return {
    date: actualRow?.date ?? originalRow?.date ?? analysis.actual.summary.payoffDate,
    actual: actualRow?.closingBalance ?? 0,
    original: originalRow?.closingBalance ?? 0,
  };
}

function restingSummary(gap: number): string {
  if (Math.abs(gap) < 1) {
    return 'Today your balance matches the original plan.';
  }

  return `Today your balance is ${formatInrShort(Math.abs(gap))} ${
    gap > 0 ? 'lower' : 'higher'
  } than on the original plan.`;
}

function differenceLabel(gap: number): string {
  if (Math.abs(gap) < 1) {
    return 'None';
  }

  return `${formatInrShort(Math.abs(gap))} ${gap > 0 ? 'lower' : 'higher'}`;
}

function differenceTone(gap: number): string {
  if (Math.abs(gap) < 1) {
    return '';
  }

  return gap > 0 ? 'tone-positive' : 'tone-negative';
}

function keyboardIndex(key: string, current: number, maxIndex: number): number | undefined {
  const moves: Record<string, number> = {
    ArrowLeft: current - 1,
    ArrowRight: current + 1,
    PageUp: current - 12,
    PageDown: current + 12,
    Home: 1,
    End: maxIndex,
  };
  const next = moves[key];

  return next === undefined ? undefined : clamp(next, 1, maxIndex);
}
