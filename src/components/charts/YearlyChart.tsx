import { useState, type KeyboardEvent } from 'react';

import type { YearlyAggregate } from '../../features/loan/loanEngine';
import { formatInrShort } from '../../utils/format';
import { clamp, niceTicks, useChartWidth } from './chartUtils';

type YearlyChartProps = {
  years: YearlyAggregate[];
  currentYear: number;
  selectedYear?: number;
  onSelect?: (year: number) => void;
};

const PAD = { left: 52, right: 8, top: 14, bottom: 28 };

const SERIES = [
  { key: 'principal', label: 'Principal through EMIs', color: 'var(--c-principal)' },
  { key: 'prepayment', label: 'Part payments', color: 'var(--c-prepay)' },
  { key: 'interest', label: 'Interest', color: 'var(--c-interest)' },
] as const;

/**
 * What each calendar year of the loan costs, split into principal, part payments and
 * interest. Years still to come are drawn as outlines. Clicking a bar picks that year; from
 * the keyboard, the arrow keys move between years and Enter picks one.
 *
 * @param props - Chart props.
 * @param props.years - Yearly totals from the current plan.
 * @param props.currentYear - Calendar year that contains today.
 * @param props.selectedYear - Year highlighted in the table below, if any.
 * @param props.onSelect - Called with a year when its bar is clicked.
 * @returns Stacked bar chart with a legend.
 */
export function YearlyChart({ years, currentYear, selectedYear, onSelect }: YearlyChartProps) {
  const [ref, width] = useChartWidth(720);
  const chart = buildYearlyChart(years, width);
  const [cursor, setCursor] = useState<number | null>(null);
  const cursorBar = cursor === null ? undefined : chart.bars[cursor];

  const startIndex = (): number => {
    const index = years.findIndex((year) => year.year === (selectedYear ?? currentYear));
    return index === -1 ? 0 : index;
  };

  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    const current = cursor ?? startIndex();
    const moves: Record<string, number> = {
      ArrowLeft: current - 1,
      ArrowRight: current + 1,
      Home: 0,
      End: years.length - 1,
    };
    const next = moves[event.key];

    if (next !== undefined) {
      event.preventDefault();
      setCursor(clamp(next, 0, years.length - 1));
    } else if ((event.key === 'Enter' || event.key === ' ') && onSelect) {
      event.preventDefault();
      const year = years[current]?.year;
      if (year !== undefined) {
        onSelect(year);
      }
    }
  };

  return (
    <div ref={ref}>
      <div
        aria-label={
          onSelect
            ? 'Yearly chart. Use the left and right arrow keys to move between years and Enter to open one in the list below.'
            : undefined
        }
        className={onSelect ? 'chart-box chart-focus' : 'chart-box'}
        role={onSelect ? 'group' : undefined}
        tabIndex={onSelect ? 0 : undefined}
        onBlur={() => setCursor(null)}
        onFocus={() => setCursor((index) => index ?? startIndex())}
        onKeyDown={onSelect ? onKeyDown : undefined}
      >
        <svg
          aria-label="Yearly payments split into principal, part payments and interest"
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
                {tick === 0 ? '₹0' : formatInrShort(tick)}
              </text>
            </g>
          ))}
          {chart.bars.map((bar) => (
            <g
              className={onSelect ? 'year-chart-bar' : undefined}
              key={bar.year}
              onClick={onSelect ? () => onSelect(bar.year) : undefined}
            >
              <title>{bar.title}</title>
              <rect
                fill="transparent"
                height={chart.innerHeight}
                width={chart.slot}
                x={bar.center - chart.slot / 2}
                y={PAD.top}
              />
              {bar.segments.map((segment) => (
                <rect
                  fill={segment.color}
                  fillOpacity={bar.year > currentYear ? 0.28 : 1}
                  height={segment.height}
                  key={segment.key}
                  stroke={bar.year > currentYear && segment.height > 0 ? segment.color : undefined}
                  width={chart.barWidth}
                  x={bar.center - chart.barWidth / 2}
                  y={segment.y}
                />
              ))}
              {bar.year === selectedYear && (
                <rect
                  fill="none"
                  height={chart.y(0) - bar.top + 4}
                  rx="3"
                  stroke="var(--ink)"
                  strokeWidth="1.5"
                  width={chart.barWidth + 6}
                  x={bar.center - chart.barWidth / 2 - 3}
                  y={bar.top - 2}
                />
              )}
              {bar === cursorBar && (
                <rect
                  data-year-cursor=""
                  fill="none"
                  height={chart.innerHeight + 4}
                  rx="4"
                  stroke="var(--primary)"
                  strokeDasharray="4 3"
                  strokeWidth="2"
                  width={chart.slot - 2}
                  x={bar.center - chart.slot / 2 + 1}
                  y={PAD.top - 2}
                />
              )}
              {bar.showLabel && (
                <text
                  className="svg-axis"
                  fontWeight={bar.year === currentYear ? 800 : undefined}
                  textAnchor="middle"
                  x={bar.center}
                  y={chart.height - 8}
                >
                  {bar.year}
                </text>
              )}
            </g>
          ))}
        </svg>
      </div>
      {onSelect && (
        <p aria-live="polite" className="chart-caption">
          {cursorBar ? `${cursorBar.title}. Press Enter to open this year.` : ''}
        </p>
      )}
      <ul className="legend">
        {SERIES.map((series) => (
          <li key={series.key}>
            <span className="swatch" style={{ background: series.color }} />
            {series.label}
          </li>
        ))}
        <li className="subtle">Outlined bars are years still to come</li>
      </ul>
    </div>
  );
}

function buildYearlyChart(years: YearlyAggregate[], width: number) {
  const height = 220;
  const innerWidth = width - PAD.left - PAD.right;
  const innerHeight = height - PAD.top - PAD.bottom;
  const totals = years.map((year) => year.principal + year.prepayment + year.interest);
  const ticks = niceTicks(0, Math.max(1, ...totals), 4);
  const high = ticks.at(-1) ?? 1;
  const y = (value: number) => PAD.top + innerHeight - (value / high) * innerHeight;
  const slot = innerWidth / Math.max(years.length, 1);
  const barWidth = clamp(slot * 0.68, 4, 38);
  const labelEvery = [1, 2, 5, 10].find((step) => step * slot >= 40) ?? 10;

  return {
    width,
    height,
    innerHeight,
    ticks,
    y,
    slot,
    barWidth,
    bars: years.map((year, index) => {
      let running = 0;
      const segments = SERIES.map((series) => {
        const value = year[series.key];
        const top = y(running + value);
        const segment = { key: series.key, color: series.color, y: top, height: y(running) - top };
        running += value;
        return segment;
      });

      return {
        year: year.year,
        center: PAD.left + slot * index + slot / 2,
        top: y(running),
        segments,
        showLabel: index % labelEvery === 0,
        title: `${year.year}: principal ${formatInrShort(year.principal)}, part payments ${formatInrShort(
          year.prepayment,
        )}, interest ${formatInrShort(year.interest)}`,
      };
    }),
  };
}
