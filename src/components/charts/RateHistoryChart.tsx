import {
  getEffectiveMonthIndex,
  type LoanAnalysis,
  type RateChange,
} from '../../features/loan/loanEngine';
import { formatPercent, pluralize } from '../../utils/format';
import { niceTicks, useChartWidth, yearTicks } from './chartUtils';

type RateHistoryChartProps = {
  analysis: LoanAnalysis;
  rateChanges: RateChange[];
};

const PAD = { left: 52, right: 16, top: 26, bottom: 28 };

/**
 * Step chart of the floating rate from the first EMI to a little past today. A floating
 * rate jumps on the date the bank resets it, so the line moves in steps, not slopes.
 *
 * @param props - Chart props.
 * @param props.analysis - Loan analysis for the start date, start rate and today.
 * @param props.rateChanges - Rate revisions to plot.
 * @returns Step chart.
 */
export function RateHistoryChart({ analysis, rateChanges }: RateHistoryChartProps) {
  const [ref, width] = useChartWidth(720);
  const chart = buildRateChart(analysis, rateChanges, width);

  return (
    <div className="chart-box" ref={ref}>
      <svg
        aria-label={chart.summary}
        height={chart.height}
        role="img"
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        width={chart.width}
      >
        {chart.yTicks.map((tick) => (
          <g key={tick}>
            <line
              stroke="var(--hairline-strong)"
              strokeDasharray="2 5"
              x1={PAD.left}
              x2={chart.width - PAD.right}
              y1={chart.y(tick)}
              y2={chart.y(tick)}
            />
            <text className="svg-axis" textAnchor="end" x={PAD.left - 8} y={chart.y(tick) + 4}>
              {formatPercent(tick)}
            </text>
          </g>
        ))}
        {chart.xTicks.map((tick) => (
          <text
            className="svg-axis"
            key={tick.index}
            textAnchor="middle"
            x={chart.x(tick.index)}
            y={chart.height - 8}
          >
            {tick.label}
          </text>
        ))}
        {chart.todayX !== undefined && (
          <g>
            <line
              stroke="var(--ink-3)"
              strokeDasharray="3 4"
              x1={chart.todayX}
              x2={chart.todayX}
              y1={PAD.top - 6}
              y2={chart.height - PAD.bottom}
            />
            <text className="svg-axis" textAnchor="middle" x={chart.todayX} y={PAD.top - 12}>
              Today
            </text>
          </g>
        )}
        <path
          d={chart.path}
          fill="none"
          stroke="var(--c-rate)"
          strokeLinejoin="round"
          strokeWidth="3"
        />
        {chart.points.map((point) => (
          <g key={`${point.index}-${point.rate}`}>
            <circle
              cx={point.x}
              cy={point.y}
              fill="var(--surface)"
              r="4.5"
              stroke="var(--c-rate)"
              strokeWidth="2.5"
            />
            <text className="svg-value" x={point.x + 7} y={point.labelY}>
              {formatPercent(point.rate)}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

function buildRateChart(analysis: LoanAnalysis, rateChanges: RateChange[], width: number) {
  const height = 210;
  const startDate = analysis.original.rows[0]?.date ?? '';
  const startRate = analysis.original.rows[0]?.rate ?? 0;
  const changes = rateChanges
    .map((change) => ({
      index: getEffectiveMonthIndex(change.date, startDate, 'rate'),
      rate: change.rate,
    }))
    .sort((left, right) => left.index - right.index);
  const lastChange = changes.at(-1)?.index ?? 1;
  const loanEnd = Math.max(analysis.actual.summary.totalMonths, 2);
  const endIndex = Math.min(loanEnd, Math.max(analysis.todayIndex, lastChange) + 9);
  const rates = [startRate, ...changes.map((change) => change.rate)];
  const yTicks = niceTicks(Math.min(...rates) - 0.1, Math.max(...rates) + 0.1, 3, 0.25);
  const low = yTicks[0] ?? 0;
  const high = yTicks.at(-1) ?? 1;
  const innerWidth = width - PAD.left - PAD.right;
  const innerHeight = height - PAD.top - PAD.bottom;
  const x = (index: number) => PAD.left + ((index - 1) / Math.max(endIndex - 1, 1)) * innerWidth;
  const y = (rate: number) => PAD.top + innerHeight - ((rate - low) / (high - low)) * innerHeight;
  const stops = [
    { index: 1, rate: startRate },
    ...changes.filter((change) => change.index <= endIndex),
  ];

  return {
    width,
    height,
    x,
    y,
    yTicks,
    xTicks: yearTicks(startDate, 1, endIndex, innerWidth / Math.max(endIndex - 1, 1)),
    todayX: analysis.todayIndex > 0 ? x(Math.min(analysis.todayIndex, endIndex)) : undefined,
    path: stepPath(stops, endIndex, x, y),
    points: stops.map((stop, i) => {
      const crowded = i > 0 && x(stop.index) - x(stops[i - 1]?.index ?? 1) < 52;
      const below = crowded && i % 2 === 1;
      return {
        ...stop,
        x: x(stop.index),
        y: y(stop.rate),
        labelY: y(stop.rate) + (below ? 17 : -9),
      };
    }),
    summary:
      changes.length === 0
        ? `The rate has stayed at ${formatPercent(startRate)}.`
        : `The rate went from ${formatPercent(startRate)} to ${formatPercent(
            rates.at(-1) ?? startRate,
          )} over ${pluralize(changes.length, 'change')}.`,
  };
}

function stepPath(
  stops: Array<{ index: number; rate: number }>,
  endIndex: number,
  x: (index: number) => number,
  y: (rate: number) => number,
): string {
  const commands: string[] = [];

  stops.forEach((stop, i) => {
    commands.push(i === 0 ? `M ${x(stop.index)} ${y(stop.rate)}` : `V ${y(stop.rate)}`);
    const nextIndex = stops[i + 1]?.index ?? endIndex;
    commands.push(`H ${x(nextIndex)}`);
  });

  return commands.join(' ');
}
