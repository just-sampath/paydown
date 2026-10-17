import { ArrowRight, CalendarRange, IndianRupee, Percent } from 'lucide-react';

import { BalanceChart, ImpactBarChart } from '../components/Charts';
import type { PageId } from '../components/Layout';
import { PaidProgressPanel } from '../components/PaidProgress';
import { Card, StatCard, toneOf } from '../components/Primitives';
import type { LoanAnalysis } from '../features/loan/loanEngine';
import {
  formatDate,
  formatDuration,
  formatInr,
  formatInrShort,
  formatMonthYear,
  formatPercent,
  formatPoints,
  pluralize,
} from '../utils/format';

type DashboardPageProps = {
  analysis: LoanAnalysis;
  isSample?: boolean;
  onNavigate?: (page: PageId) => void;
};

/**
 * Renders the dashboard overview page.
 *
 * Each figure appears once: the hero holds the payoff story, the KPI row holds what is
 * due next, the progress card holds the money paid and still to pay, and the charts show
 * how it got here.
 *
 * @param props - Dashboard props.
 * @param props.analysis - Loan analysis used for KPIs and charts.
 * @param props.isSample - Whether the fictional sample loan is shown.
 * @param props.onNavigate - Opens another page.
 * @returns Dashboard page element.
 */
export function DashboardPage({ analysis, isSample = false, onNavigate }: DashboardPageProps) {
  const currentRate = analysis.nextRow?.rate ?? analysis.actual.rows.at(-1)?.rate ?? 0;
  const startRate = analysis.original.rows[0]?.rate ?? currentRate;
  const impactEvents = [...analysis.rateImpacts, ...analysis.partPaymentImpacts].sort((a, b) =>
    a.date.localeCompare(b.date),
  );

  return (
    <div className="content stack">
      <Hero analysis={analysis} isSample={isSample} />

      <div className="kpi-grid is-three">
        <StatCard
          icon={<IndianRupee aria-hidden="true" size={14} />}
          label="Next EMI"
          value={analysis.nextRow ? formatInr(analysis.nextRow.emi) : 'None'}
          detail={
            analysis.nextRow ? `Due ${formatDate(analysis.nextRow.date)}` : 'The loan is paid off'
          }
        />
        <StatCard
          icon={<Percent aria-hidden="true" size={14} />}
          label="Current rate"
          value={formatPercent(currentRate)}
          detail={rateDetail(currentRate - startRate)}
          tone={toneOf(startRate - currentRate)}
        />
        <StatCard
          icon={<CalendarRange aria-hidden="true" size={14} />}
          label="EMIs left"
          value={analysis.remainingPaymentCount}
          detail={`${pluralize(analysis.completedRows.length, 'EMI')} paid so far`}
        />
      </div>

      <PaidProgressPanel analysis={analysis} />

      <Card
        eyebrow="Balance"
        title="Your loan against the original plan"
        subtitle="The dashed line is the original plan, with no rate changes and no part payments."
      >
        <BalanceChart analysis={analysis} />
      </Card>

      <div className="split">
        <Card
          eyebrow="Rate changes and part payments"
          title="Months each one took off"
          subtitle="In date order. Each bar counts only what that change did on top of the earlier ones, so together they add up to how far your payoff date has moved."
        >
          <ImpactBarChart events={impactEvents} />
        </Card>
        <Card
          eyebrow="Recent EMIs"
          title="Last 6 payments"
          subtitle="How each EMI split between principal and interest."
          action={
            onNavigate && (
              <button className="btn-link" type="button" onClick={() => onNavigate('schedule')}>
                Full schedule
                <ArrowRight aria-hidden="true" size={15} />
              </button>
            )
          }
        >
          <RecentPayments analysis={analysis} />
        </Card>
      </div>
    </div>
  );
}

function Hero({ analysis, isSample }: { analysis: LoanAnalysis; isSample: boolean }) {
  const months = analysis.monthsSaved;
  const behind = months < 0;
  const original = analysis.original.summary;
  const actual = analysis.actual.summary;
  const eventCount = `${pluralize(analysis.rateImpacts.length, 'rate change')} and ${pluralize(
    analysis.partPaymentImpacts.length,
    'part payment',
  )}`;

  return (
    <section className="hero" aria-labelledby="hero-title">
      <div>
        {isSample && <div className="label">Sample loan with made-up numbers</div>}
        <h2 className={behind ? 'hero-title is-behind' : 'hero-title'} id="hero-title">
          {months === 0 ? (
            <>
              Debt-free in <em>{formatMonthYear(actual.payoffDate)}</em>
            </>
          ) : (
            <>
              Debt-free <em>{formatDuration(Math.abs(months))}</em> {behind ? 'later' : 'sooner'}
            </>
          )}
        </h2>
        <p className="hero-copy">{heroCopy(months, eventCount)}</p>
        <div className={behind ? 'hero-status is-behind' : 'hero-status'}>
          {statusLabel(months)}
        </div>
      </div>
      <div className="plan-compare">
        <div className="plan-compare-row">
          <span className="label">Original plan</span>
          <strong>{formatMonthYear(original.payoffDate)}</strong>
          <small>{formatDuration(original.totalMonths)} of EMIs</small>
        </div>
        <div className="plan-compare-row is-current">
          <span className="label">Current plan</span>
          <strong>{formatMonthYear(actual.payoffDate)}</strong>
          <small>{formatDuration(actual.totalMonths)} of EMIs</small>
        </div>
        <div className="plan-compare-row">
          <span className="label">
            {analysis.interestSaved >= 0 ? 'Interest saved' : 'Interest added'}
          </span>
          <strong>{formatInrShort(Math.abs(analysis.interestSaved))}</strong>
          <small>Compared with the original plan</small>
        </div>
      </div>
    </section>
  );
}

function heroCopy(months: number, eventCount: string): string {
  if (months > 0) {
    return `Your ${eventCount} took that much off the original term.`;
  }

  if (months < 0) {
    return `Your ${eventCount} together pushed the payoff past the original term.`;
  }

  return 'Your loan is still on its original term.';
}

function statusLabel(months: number): string {
  if (months > 0) {
    return 'Ahead of the original plan';
  }

  return months < 0 ? 'Behind the original plan' : 'On the original plan';
}

function rateDetail(change: number): string {
  if (Math.abs(change) < 0.005) {
    return 'Same as at the start';
  }

  return `${formatPoints(change)} ${change < 0 ? 'lower' : 'higher'} than at the start`;
}

function RecentPayments({ analysis }: { analysis: LoanAnalysis }) {
  const rows = analysis.completedRows.slice(-6).reverse();

  if (rows.length === 0) {
    return <p className="subtle m-0 text-sm">No EMIs paid yet.</p>;
  }

  return (
    <div className="table-wrap">
      <table className="table">
        <thead>
          <tr>
            <th>Month</th>
            <th className="numeric">Principal</th>
            <th className="numeric">Interest</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.index}>
              <td className="font-semibold">
                {formatMonthYear(row.date)}
                {row.prepayment > 0 && (
                  <span className="chip chip-prepay ml-2">+{formatInrShort(row.prepayment)}</span>
                )}
              </td>
              <td className="numeric">{formatInr(row.principal)}</td>
              <td className="numeric">{formatInr(row.interest)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
