import { act } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test, vi } from 'vitest';

import { sampleLoan } from '../../src/config/sampleLoan';
import {
  buildLoanAnalysis,
  type EventImpact,
  type RateImpact,
} from '../../src/features/loan/loanEngine';
import {
  BalanceChart,
  ImpactBarChart,
  RateHistoryChart,
  YearlyChart,
} from '../../src/components/Charts';
import { render } from '../render';

const analysis = buildLoanAnalysis(sampleLoan.loan, '2026-08-15');

function key(element: Element, name: string): void {
  act(() => {
    element.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));
  });
}

describe('dashboard charts', () => {
  test('balance chart marks today, both payoffs and every event', () => {
    const markup = renderToStaticMarkup(<BalanceChart analysis={analysis} />);

    expect(markup).toContain('Today');
    expect(markup).toContain('>Debt-free<');
    expect(markup).toContain('>Original end<');
    expect(markup).toContain('<title>Debt-free Jan 2038</title>');
    expect(markup).toContain('<title>Original plan ends Mar 2043</title>');
    expect(markup).toContain('>2024<');
    expect(markup).toContain('tabindex="0"');
    expect(markup.match(/data-event-kind="rate"/g)).toHaveLength(3);
    expect(markup.match(/data-event-kind="prepayment"/g)).toHaveLength(3);
  });

  test('at rest the readout gives the gap to the original plan, not the balance', () => {
    const markup = renderToStaticMarkup(<BalanceChart analysis={analysis} />);

    expect(markup).toMatch(/Today your balance is ₹[\d.]+L lower than on the original plan\./);
    expect(markup).toContain('Point at the chart or use the arrow keys to read any month.');
    expect(markup).not.toContain('Your balance<');
  });

  test('focusing the chart shows the month tiles, and the arrow keys move them', () => {
    const { container, cleanup } = render(<BalanceChart analysis={analysis} />);
    const chart = container.querySelector('.chart-focus') as HTMLElement;

    act(() => chart.focus());
    expect(container.textContent).toContain('Your balance');
    expect(container.textContent).toContain('Aug 2026');

    key(chart, 'ArrowRight');
    expect(container.textContent).toContain('Sep 2026');

    act(() => chart.blur());
    expect(container.textContent).not.toContain('Your balance');
    cleanup();
  });

  test('balance chart fits a loan that now runs past the original term', () => {
    const behind = buildLoanAnalysis(
      { ...sampleLoan.loan, rateChanges: [{ date: '2023-11-01', rate: 10.5 }], partPayments: [] },
      '2026-08-15',
    );
    const markup = renderToStaticMarkup(<BalanceChart analysis={behind} />);

    expect(behind.monthsSaved).toBeLessThan(0);
    expect(markup).toContain('var(--c-negative)');
    expect(markup).toContain('higher than on the original plan');
  });

  test('impact bars carry labels, and a bar that added months sits below zero', () => {
    const events = [...analysis.rateImpacts, ...analysis.partPaymentImpacts].sort((left, right) =>
      left.date.localeCompare(right.date),
    );
    const markup = renderToStaticMarkup(<ImpactBarChart events={events} />);

    expect(markup).toContain('8.95%');
    expect(markup).toContain('₹1.25L');
    expect(markup).toContain('data-impact-kind="rate"');
    expect(markup).toContain('data-impact-kind="prepayment"');
    expect(markup).toContain('took 62 months off');

    const added: EventImpact[] = [{ date: '2024-01-01', monthsSaved: -3, interestSaved: -1 }];
    const negative = renderToStaticMarkup(<ImpactBarChart events={added} />);
    expect(negative).toContain('>-3<');
    expect(negative).not.toMatch(/height="-/);
  });

  test('impact chart turns sideways instead of dropping labels when bars get narrow', () => {
    const many: RateImpact[] = Array.from({ length: 12 }, (_, index) => ({
      date: `2024-${String(index + 1).padStart(2, '0')}-01`,
      rate: 8 + index / 10,
      monthsSaved: index - 2,
      interestSaved: 1,
    }));
    const markup = renderToStaticMarkup(<ImpactBarChart events={many} />);

    expect(markup).toContain('class="impact-list"');
    expect(markup).not.toContain('<svg');
    expect(markup.match(/<li data-impact-kind="rate"/g)).toHaveLength(12);
    expect(markup).toContain('9.10%');
    expect(markup).toContain('>-2<');
  });

  test('impact chart explains itself when there are no events', () => {
    const markup = renderToStaticMarkup(<ImpactBarChart events={[]} />);

    expect(markup).toContain('No rate changes or part payments yet');
  });

  test('yearly chart picks a year from the keyboard', () => {
    const onSelect = vi.fn();
    const { container, cleanup } = render(
      <YearlyChart currentYear={2026} years={analysis.yearlyActual} onSelect={onSelect} />,
    );
    const chart = container.querySelector('[role="group"]') as HTMLElement;

    act(() => chart.focus());
    expect(container.querySelector('[data-year-cursor]')).toBeTruthy();
    expect(container.textContent).toContain('2026: principal');

    key(chart, 'ArrowRight');
    expect(container.textContent).toContain('2027: principal');
    key(chart, 'Enter');
    expect(onSelect).toHaveBeenCalledWith(2027);

    cleanup();
  });

  test('yearly chart and rate history render their summaries', () => {
    const yearly = renderToStaticMarkup(
      <YearlyChart currentYear={2026} years={analysis.yearlyActual} />,
    );
    const rates = renderToStaticMarkup(
      <RateHistoryChart analysis={analysis} rateChanges={sampleLoan.loan.rateChanges} />,
    );

    expect(yearly).toContain('Outlined bars are years still to come');
    expect(yearly).not.toContain('tabindex');
    expect(rates).toContain('went from 9.15% to 8.35% over 3 changes');
    expect(rates).toMatch(/d="M [^"]* H [^"]* V /);
  });
});
