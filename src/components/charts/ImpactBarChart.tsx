import type { EventImpact } from '../../features/loan/loanEngine';
import { formatInrShort, formatPercent, pluralize } from '../../utils/format';
import { clamp, niceTicks, shortMonthYear, useChartWidth } from './chartUtils';

type ImpactBarChartProps = {
  events: EventImpact[];
};

const PAD = { left: 40, right: 8, top: 22, bottom: 44 };

/** Narrowest slot that still fits a rate or amount label under its bar. */
const MIN_SLOT = 56;

/**
 * Months each rate change or part payment took off the loan, in date order. A bar below
 * the zero line means that event added months. When the labels can't fit under the bars
 * (a phone, or many events), the bars run sideways, one row per event, so every rate and
 * amount keeps its label.
 *
 * @param props - Chart props.
 * @param props.events - Rate and part-payment impacts sorted by date.
 * @returns Bar chart with a legend.
 */
export function ImpactBarChart({ events }: ImpactBarChartProps) {
  const [ref, width] = useChartWidth(560);

  if (events.length === 0) {
    return (
      <div className="empty-state" ref={ref}>
        <strong>No rate changes or part payments yet</strong>
        <span className="subtle text-sm">Add one and its effect shows up here.</span>
      </div>
    );
  }

  // When the labels can't fit under the bars, the chart lies on its side instead of
  // dropping them.
  if ((width - PAD.left - PAD.right) / events.length < MIN_SLOT) {
    return (
      <div ref={ref}>
        <ImpactList events={events} />
        <ImpactLegend />
      </div>
    );
  }

  const chart = buildImpactChart(events, width);

  return (
    <div ref={ref}>
      <div className="chart-box">
        <svg
          aria-label={chart.summary}
          height={chart.height}
          role="img"
          viewBox={`0 0 ${chart.width} ${chart.height}`}
          width={chart.width}
        >
          {chart.ticks.map((tick) => (
            <g key={tick}>
              <line
                stroke="var(--hairline-strong)"
                strokeDasharray={tick === 0 ? undefined : '2 5'}
                x1={PAD.left}
                x2={chart.width - PAD.right}
                y1={chart.y(tick)}
                y2={chart.y(tick)}
              />
              <text className="svg-axis" textAnchor="end" x={PAD.left - 8} y={chart.y(tick) + 4}>
                {tick}
              </text>
            </g>
          ))}
          {chart.bars.map((bar) => (
            <g data-impact-kind={bar.kind} key={`${bar.kind}-${bar.date}-${bar.x}`}>
              <title>{`${bar.kind === 'rate' ? 'Rate change to' : 'Part payment of'} ${bar.label}, ${shortMonthYear(
                bar.date,
              )}: ${pluralize(bar.months, 'month')}`}</title>
              <rect
                fill={bar.color}
                height={bar.height}
                rx="3"
                width={bar.width}
                x={bar.x}
                y={bar.top}
              />
              <text
                className="svg-value"
                textAnchor="middle"
                x={bar.center}
                y={bar.months >= 0 ? bar.top - 6 : bar.top + bar.height + 14}
              >
                {bar.months}
              </text>
              <text className="svg-axis" textAnchor="middle" x={bar.center} y={chart.height - 24}>
                {bar.label}
              </text>
              <text className="svg-axis" textAnchor="middle" x={bar.center} y={chart.height - 8}>
                {shortMonthYear(bar.date)}
              </text>
            </g>
          ))}
        </svg>
      </div>
      <ImpactLegend />
    </div>
  );
}

function ImpactLegend() {
  return (
    <ul className="legend">
      <li>
        <span className="swatch" style={{ background: 'var(--c-rate)' }} />
        Rate change
      </li>
      <li>
        <span className="swatch" style={{ background: 'var(--c-prepay)' }} />
        Part payment
      </li>
      <li className="subtle">Numbers are months</li>
    </ul>
  );
}

function ImpactList({ events }: ImpactBarChartProps) {
  const values = events.map((event) => event.monthsSaved);
  const low = Math.min(0, ...values);
  const span = Math.max(1, ...values) - low;
  const position = (value: number) => ((value - low) / span) * 100;
  const total = values.reduce((sum, value) => sum + value, 0);

  return (
    <ol
      aria-label={`${pluralize(events.length, 'event')} together took ${pluralize(total, 'month')} off the loan.`}
      className="impact-list"
    >
      {events.map((event, index) => {
        const kind = eventKind(event);
        const color = kind === 'rate' ? 'var(--c-rate)' : 'var(--c-prepay)';
        const start = position(Math.min(0, event.monthsSaved));
        const end = position(Math.max(0, event.monthsSaved));

        return (
          <li data-impact-kind={kind} key={`${kind}-${event.date}-${index}`}>
            <span className="impact-name">
              <span className="swatch" style={{ background: color }} />
              <span>
                {eventLabel(event)}
                <span className="subtle"> {shortMonthYear(event.date)}</span>
              </span>
            </span>
            <span aria-hidden="true" className="impact-track">
              <span className="impact-zero" style={{ left: `${position(0)}%` }} />
              <span
                className="impact-bar"
                style={{
                  left: `${start}%`,
                  width: `${Math.max(end - start, 1)}%`,
                  background: color,
                }}
              />
            </span>
            <strong className="impact-months">{event.monthsSaved}</strong>
          </li>
        );
      })}
    </ol>
  );
}

function buildImpactChart(events: EventImpact[], width: number) {
  const height = 230;
  const values = events.map((event) => event.monthsSaved);
  const ticks = niceTicks(Math.min(0, ...values), Math.max(1, ...values), 4, 1);
  const low = ticks[0] ?? 0;
  const high = ticks.at(-1) ?? 1;
  const innerHeight = height - PAD.top - PAD.bottom;
  const innerWidth = width - PAD.left - PAD.right;
  const slot = innerWidth / events.length;
  const barWidth = clamp(slot * 0.62, 8, 56);
  const y = (value: number) => PAD.top + innerHeight - ((value - low) / (high - low)) * innerHeight;
  const total = values.reduce((sum, value) => sum + value, 0);

  return {
    width,
    height,
    ticks,
    y,
    summary: `${pluralize(events.length, 'event')} together took ${pluralize(total, 'month')} off the loan.`,
    bars: events.map((event, index) => {
      const kind = eventKind(event);
      const center = PAD.left + slot * index + slot / 2;
      const top = Math.min(y(event.monthsSaved), y(0));

      return {
        kind,
        date: event.date,
        months: event.monthsSaved,
        center,
        x: center - barWidth / 2,
        width: barWidth,
        top,
        height: Math.max(Math.abs(y(event.monthsSaved) - y(0)), 1),
        color: kind === 'rate' ? 'var(--c-rate)' : 'var(--c-prepay)',
        label: eventLabel(event),
      };
    }),
  };
}

function eventKind(event: EventImpact): 'prepayment' | 'rate' {
  return 'amount' in event ? 'prepayment' : 'rate';
}

function eventLabel(event: EventImpact): string {
  if ('rate' in event && typeof event.rate === 'number') {
    return formatPercent(event.rate);
  }

  if ('amount' in event && typeof event.amount === 'number') {
    return formatInrShort(event.amount);
  }

  return '';
}
