import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { sampleLoan } from '../../src/config/sampleLoan';
import { buildLoanAnalysis } from '../../src/features/loan/loanEngine';
import { DashboardPage } from '../../src/pages/DashboardPage';

const today = '2026-08-15';

/**
 * Visible page text without chart drawings, whose axis labels and tags are labels. Text
 * nodes are joined with a separator so "Original plan" and "Mar 2043" can't run together.
 */
function textOutsideCharts(markup: string): string {
  const host = document.createElement('div');
  host.innerHTML = markup;
  host.querySelectorAll('svg').forEach((svg) => svg.remove());
  const parts: string[] = [];
  const walker = document.createTreeWalker(host, NodeFilter.SHOW_TEXT);

  for (let node = walker.nextNode(); node !== null; node = walker.nextNode()) {
    parts.push(node.textContent ?? '');
  }

  return parts.join(' | ');
}

function repeated(values: string[]): string[] {
  return values.filter((value, index) => values.indexOf(value) !== index);
}

describe('dashboard', () => {
  test('tells the payoff story once and keeps what is due next in the KPI row', () => {
    const markup = renderToStaticMarkup(
      <DashboardPage analysis={buildLoanAnalysis(sampleLoan.loan, today)} isSample />,
    );

    expect(markup).toContain('Sample loan with made-up numbers');
    expect(markup).toContain('Debt-free <em>5 yr 2 mo</em> sooner');
    expect(markup).toContain('took that much off the original term.');
    expect(markup).toContain('Ahead of the original plan');
    expect(markup).toContain('Mar 2043');
    expect(markup).toContain('Jan 2038');
    expect(markup).toContain('EMIs left');
    expect(markup).toContain('41 EMIs paid so far');
    expect(markup).toContain('0.80 pts lower than at the start');
    expect(markup).not.toContain('Where the money goes');
    expect(markup).not.toContain('Payment calendar');
  });

  test('never shows the same figure or month twice outside the charts', () => {
    const text = textOutsideCharts(
      renderToStaticMarkup(<DashboardPage analysis={buildLoanAnalysis(sampleLoan.loan, today)} />),
    );
    const amounts = text.match(/₹[\d.,]+[LK]?/g) ?? [];
    const months = text.match(/[A-Z][a-z]{2} \d{4}/g) ?? [];
    const durations = text.match(/\d+ yr( \d+ mo)?|\b\d+ mo\b/g) ?? [];

    expect(amounts.length).toBeGreaterThan(10);
    expect(months).toEqual(expect.arrayContaining(['Mar 2043', 'Jan 2038', 'Sep 2026']));
    expect(durations).toEqual(['5 yr 2 mo', '20 yr', '14 yr 10 mo']);
    expect(repeated(amounts)).toEqual([]);
    expect(repeated(months)).toEqual([]);
  });

  test('says "later" in plain words when rate rises push the payoff out', () => {
    const behind = buildLoanAnalysis(
      { ...sampleLoan.loan, rateChanges: [{ date: '2023-11-01', rate: 10.5 }], partPayments: [] },
      today,
    );
    const markup = renderToStaticMarkup(<DashboardPage analysis={behind} />);

    expect(markup).toContain('later');
    expect(markup).toContain('Behind the original plan');
    expect(markup).toContain('Interest added');
    expect(markup).toContain('higher than at the start');
    expect(markup).not.toContain('On track');
    expect(markup).not.toMatch(/Debt-free <em>-/);
  });

  test('names the payoff month when nothing has changed', () => {
    const unchanged = buildLoanAnalysis(
      { ...sampleLoan.loan, rateChanges: [], partPayments: [] },
      today,
    );
    const markup = renderToStaticMarkup(<DashboardPage analysis={unchanged} />);

    expect(markup).toContain('Debt-free in <em>');
    expect(markup).toContain('On the original plan');
    expect(markup).toContain('No rate changes or part payments yet');
  });
});
