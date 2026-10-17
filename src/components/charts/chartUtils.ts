import { useLayoutEffect, useState } from 'react';

import { formatMonthYear } from '../../utils/format';

/**
 * Measures the width of a chart container so the SVG can be drawn at 1:1 scale.
 *
 * Drawing at the real pixel width keeps axis text at its CSS size on a phone instead of
 * shrinking a fixed desktop-sized viewBox. Falls back to `fallback` where
 * `ResizeObserver` is missing (tests, server rendering).
 *
 * @param fallback - Width to use before the first measurement.
 * @returns A callback ref for the container and its current width in pixels.
 */
export function useChartWidth(fallback: number) {
  const [element, setElement] = useState<HTMLDivElement | null>(null);
  const [width, setWidth] = useState(fallback);

  useLayoutEffect(() => {
    if (element === null || typeof ResizeObserver === 'undefined') {
      return undefined;
    }

    const measure = (next: number): void => {
      if (next > 0) {
        setWidth(Math.round(next));
      }
    };
    const observer = new ResizeObserver((entries) => measure(entries[0]?.contentRect.width ?? 0));

    // Measure now as well: resize notifications only arrive on the next rendered frame,
    // which never comes while the tab is in the background.
    measure(element.clientWidth);
    observer.observe(element);

    return () => observer.disconnect();
  }, [element]);

  return [setElement, width] as const;
}

/**
 * Picks round tick values that cover a range.
 *
 * @param min - Lowest value to cover.
 * @param max - Highest value to cover.
 * @param count - Rough number of intervals wanted.
 * @param minStep - Smallest allowed step, such as 1 for whole months.
 * @returns Ascending tick values from at or below `min` to at or above `max`.
 */
export function niceTicks(min: number, max: number, count: number, minStep = 0): number[] {
  const span = max - min || Math.abs(max) || 1;
  const step = Math.max(minStep, niceNumber(span / count));
  const first = Math.floor(min / step) * step;
  const last = Math.ceil(max / step) * step;
  const ticks: number[] = [];

  for (let value = first; value <= last + step / 2; value += step) {
    ticks.push(Number(value.toFixed(6)));
  }

  return ticks;
}

function niceNumber(value: number): number {
  const exponent = Math.floor(Math.log10(value));
  const base = 10 ** exponent;
  const fraction = value / base;

  if (fraction <= 1) {
    return base;
  }

  if (fraction <= 2) {
    return 2 * base;
  }

  if (fraction <= 5) {
    return 5 * base;
  }

  return 10 * base;
}

/**
 * Builds January tick marks for a monthly schedule, thinned out to fit the width.
 *
 * @param startDate - ISO date of payment 1.
 * @param firstIndex - First month index on the axis.
 * @param lastIndex - Last month index on the axis.
 * @param pixelsPerMonth - Horizontal pixels per month.
 * @returns Tick month indexes and their year labels.
 */
export function yearTicks(
  startDate: string,
  firstIndex: number,
  lastIndex: number,
  pixelsPerMonth: number,
): Array<{ index: number; label: string }> {
  const [startYear = 0, startMonth = 1] = startDate.split('-').map(Number);
  const firstJanuary = 1 + ((13 - startMonth) % 12);
  const firstJanuaryYear = startMonth === 1 ? startYear : startYear + 1;
  const pixelsPerYear = pixelsPerMonth * 12;
  const step = [1, 2, 5, 10].find((years) => years * pixelsPerYear >= 40) ?? 10;
  const ticks: Array<{ index: number; label: string }> = [];

  for (let index = firstJanuary; index <= lastIndex; index += 12) {
    const year = firstJanuaryYear + (index - firstJanuary) / 12;

    if (index >= firstIndex && year % step === 0) {
      ticks.push({ index, label: String(year) });
    }
  }

  return ticks;
}

/**
 * Formats an ISO date as a short month and two-digit year for tight axis labels.
 *
 * @param isoDate - ISO date string.
 * @returns Label such as `Nov '23`.
 */
export function shortMonthYear(isoDate: string): string {
  const [month = '', year = ''] = formatMonthYear(isoDate).split(' ');
  return `${month} '${year.slice(2)}`;
}

/**
 * Restricts a number to a range.
 *
 * @param value - Number to restrict.
 * @param min - Lower bound.
 * @param max - Upper bound.
 * @returns `value` limited to `[min, max]`.
 */
export function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}
