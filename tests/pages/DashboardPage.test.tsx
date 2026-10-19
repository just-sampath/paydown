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

function heroCopyText(markup: string): string {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return host.querySelector('.hero-copy')?.textContent ?? '';
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
    expect(textOutsideCharts(markup).replace(/(\s*\|\s*)+/g, ' ')).toContain(
      '11 years 5 months left to pay',
    );
    // The headline may wrap between the parts on a phone, never inside one.
    expect(markup).toContain('<em><span>11 years</span> <span>5 months</span></em>');
    expect(heroCopyText(markup)).toContain('took 5 yr 2 mo off the original term.');
    expect(markup).toContain('<span class="whitespace-nowrap">5 yr 2 mo</span>');
    expect(markup).not.toContain('Ahead of the original plan');
    expect(markup).toContain('Mar 2043');
    expect(markup).toContain('Jan 2038');
    expect(markup).toContain('EMIs left');
    expect(markup).toContain('41 EMIs paid so far');
    expect(markup).toContain('Down from 9.15%');
    expect(markup).not.toContain('pts');
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

  test('says how much time rate rises added, in plain words', () => {
    const behind = buildLoanAnalysis(
      { ...sampleLoan.loan, rateChanges: [{ date: '2023-11-01', rate: 10.5 }], partPayments: [] },
      today,
    );
    const markup = renderToStaticMarkup(<DashboardPage analysis={behind} />);

    expect(heroCopyText(markup)).toMatch(/added \d+ (yr|mo)[^.]* to the original term\./);
    expect(markup).toContain('Interest added');
    expect(markup).toContain('Up from 9.15%');
    expect(markup).not.toContain('On track');
    expect(heroCopyText(markup)).not.toContain('-');
  });

  test('still shows the time left when nothing has changed', () => {
    const unchanged = buildLoanAnalysis(
      { ...sampleLoan.loan, rateChanges: [], partPayments: [] },
      today,
    );
    const markup = renderToStaticMarkup(<DashboardPage analysis={unchanged} />);

    expect(markup).toContain('left to pay');
    expect(markup).toContain('Your loan is still on its original term.');
    expect(markup).toContain('No rate changes or part payments yet');
  });

  test('says the loan is paid off once the last EMI is behind it', () => {
    const markup = renderToStaticMarkup(
      <DashboardPage analysis={buildLoanAnalysis(sampleLoan.loan, '2045-01-01')} />,
    );

    expect(markup).toContain('Your loan is <em>paid off</em>');
    expect(markup).not.toContain('left to pay');
  });
});
