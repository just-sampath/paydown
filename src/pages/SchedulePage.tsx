import { ChevronDown, ChevronRight } from 'lucide-react';
import { useMemo, useState } from 'react';

import { YearlyChart } from '../components/Charts';
import { Card, StatCard } from '../components/Primitives';
import type { LoanAnalysis, ScheduleRow, YearlyAggregate } from '../features/loan/loanEngine';
import {
  formatInr,
  formatInrShort,
  formatMonthYear,
  formatPercent,
  pluralize,
} from '../utils/format';

type SchedulePageProps = {
  analysis: LoanAnalysis;
};

/**
 * Renders the payment schedule: totals, a year-by-year chart, and every EMI grouped by
 * calendar year. The year holding the next EMI starts open.
 *
 * @param props - Schedule page props.
 * @param props.analysis - Loan analysis containing the actual schedule.
 * @returns Schedule page element.
 */
export function SchedulePage({ analysis }: SchedulePageProps) {
  const summary = analysis.actual.summary;
  const rowsByYear = useMemo(() => groupRowsByYear(analysis.actual.rows), [analysis.actual.rows]);
  const nextYear = Number((analysis.nextRow?.date ?? summary.payoffDate).slice(0, 4));
  const [openYears, setOpenYears] = useState<Set<number>>(() => new Set([nextYear]));
  const allOpen = openYears.size === analysis.yearlyActual.length;
  const interestOutsideEmis = summary.totalSimpleInterest + summary.preEmiInterest;
  const nextIndex = analysis.nextRow?.index;

  const toggleYear = (year: number): void => {
    setOpenYears((current) => {
      const next = new Set(current);
      if (next.has(year)) {
        next.delete(year);
      } else {
        next.add(year);
      }
      return next;
    });
  };

  const showYear = (year: number): void => {
    setOpenYears((current) => new Set([...current, year]));
    scrollToElement(`year-${year}`, 'start');
  };

  const showNextEmi = (): void => {
    setOpenYears((current) => new Set([...current, nextYear]));
    scrollToElement(`emi-${nextIndex}`, 'center');
  };

  return (
    <div className="content stack">
      <div className="kpi-grid">
        <StatCard
          label="EMIs"
          value={summary.totalMonths}
          detail={emiCountDetail(analysis.monthsSaved, analysis.original.summary.totalMonths)}
        />
        <StatCard
          label="Principal"
          value={formatInrShort(summary.totalPrincipal)}
          detail={`${formatInrShort(summary.principalFromEmi)} through EMIs, ${formatInrShort(
            summary.totalPrepayment,
          )} in part payments`}
        />
        <StatCard
          label="Interest"
          value={formatInrShort(summary.totalInterest)}
          detail={`${formatInrShort(summary.scheduledInterest)} EMI interest, ${formatInrShort(
            interestOutsideEmis,
          )} interest outside EMIs`}
        />
        <StatCard
          label="Total paid"
          value={formatInrShort(summary.totalOutflow)}
          detail="Principal plus all interest, first EMI to last"
        />
      </div>

      <Card
        eyebrow="Year by year"
        title="Where each year's money goes"
        subtitle="Early years are mostly interest. Each year more of the EMI goes to principal. Pick a bar to open that year in the list below."
      >
        <YearlyChart currentYear={nextYear} years={analysis.yearlyActual} onSelect={showYear} />
      </Card>

      <Card
        eyebrow="Every EMI"
        title={`${pluralize(summary.totalMonths, 'EMI')} by year`}
        subtitle={`Each EMI is ${formatInr(summary.baseEmi)} and the last one is ${formatInr(
          analysis.actual.rows.at(-1)?.emi ?? 0,
        )}. Months with a part payment also show the part-payment interest charged.`}
        action={
          <div className="flex flex-wrap gap-2">
            {nextIndex !== undefined && (
              <button className="btn btn-sm btn-primary" type="button" onClick={showNextEmi}>
                Go to next EMI
              </button>
            )}
            <button
              className="btn btn-sm"
              type="button"
              onClick={() =>
                setOpenYears(
                  allOpen ? new Set() : new Set(analysis.yearlyActual.map((year) => year.year)),
                )
              }
            >
              {allOpen ? 'Close all years' : 'Open all years'}
            </button>
          </div>
        }
      >
        <div className="table-wrap schedule-wrap">
          <table className="table schedule-table">
            <thead>
              <tr>
                <th>Month</th>
                <th className="numeric">Principal</th>
                <th className="numeric">Interest</th>
                <th className="numeric col-optional">Part payment</th>
                <th className="numeric">Balance</th>
                <th className="numeric col-optional">Rate</th>
              </tr>
            </thead>
            {analysis.yearlyActual.map((year) => (
              <YearGroup
                key={year.year}
                nextIndex={nextIndex}
                open={openYears.has(year.year)}
                rows={rowsByYear.get(year.year) ?? []}
                year={year}
                onToggle={() => toggleYear(year.year)}
              />
            ))}
          </table>
        </div>
      </Card>
    </div>
  );
}

type YearGroupProps = {
  year: YearlyAggregate;
  rows: ScheduleRow[];
  open: boolean;
  nextIndex: number | undefined;
  onToggle: () => void;
};

function YearGroup({ year, rows, open, nextIndex, onToggle }: YearGroupProps) {
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <tbody id={`year-${year.year}`}>
      <tr className="year-row">
        <th scope="rowgroup">
          <button aria-expanded={open} className="year-button" type="button" onClick={onToggle}>
            <Chevron aria-hidden="true" size={16} />
            {year.year}
            <span className="subtle only-wide text-xs font-semibold">
              {pluralize(year.count, 'EMI')}
            </span>
          </button>
        </th>
        <td className="numeric">{formatInrShort(year.principal)}</td>
        <td className="numeric">{formatInrShort(year.interest)}</td>
        <td className="numeric col-optional">
          {year.prepayment > 0 ? formatInrShort(year.prepayment) : ''}
        </td>
        <td className="numeric">{formatInrShort(year.endBalance)}</td>
        <td className="col-optional" />
      </tr>
      {open && rows.map((row) => <MonthRow key={row.index} nextIndex={nextIndex} row={row} />)}
    </tbody>
  );
}

function MonthRow({ row, nextIndex }: { row: ScheduleRow; nextIndex: number | undefined }) {
  const state = rowState(row.index, nextIndex);

  return (
    <tr
      aria-current={state === 'next' ? 'date' : undefined}
      className={`month-row is-${state}`}
      id={`emi-${row.index}`}
    >
      <td>
        <span className="font-semibold">{formatMonthYear(row.date)}</span>
        <span className="subtle ml-2 text-xs">#{row.index}</span>
        {state === 'next' && <span className="chip only-wide ml-2">Next</span>}
        {row.prepayment > 0 && (
          <span className="chip chip-prepay only-narrow ml-2">
            +{formatInrShort(row.prepayment)}
          </span>
        )}
      </td>
      <td className="numeric">{formatInr(row.principal)}</td>
      <td className="numeric">
        {formatInr(row.interest)}
        {row.simpleInterest > 0 && (
          <span className="block whitespace-normal text-xs subtle">
            +{formatInr(row.simpleInterest)}
            <span className="only-wide"> part-payment interest</span>
          </span>
        )}
      </td>
      <td className="numeric col-optional">
        {row.prepayment > 0 ? (
          <span className="chip chip-prepay">{formatInr(row.prepayment)}</span>
        ) : (
          ''
        )}
      </td>
      <td className="numeric font-bold">
        <span className="only-wide">{formatInr(row.closingBalance)}</span>
        <span className="only-narrow">{formatInrShort(row.closingBalance)}</span>
      </td>
      <td className="numeric col-optional">
        {row.rateChanged ? (
          <span className="chip chip-rate">{formatPercent(row.rate)}</span>
        ) : (
          <span className="subtle">{formatPercent(row.rate)}</span>
        )}
      </td>
    </tr>
  );
}

/**
 * Scrolls an element into view once React has drawn it, without animation for people who
 * ask their system for reduced motion.
 *
 * @param id - Element id.
 * @param block - Vertical alignment.
 */
function scrollToElement(id: string, block: ScrollLogicalPosition): void {
  const reduceMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

  window.requestAnimationFrame(() =>
    document
      .getElementById(id)
      ?.scrollIntoView({ behavior: reduceMotion ? 'auto' : 'smooth', block }),
  );
}

function rowState(index: number, nextIndex: number | undefined): 'past' | 'next' | 'future' {
  if (nextIndex === undefined || index < nextIndex) {
    return 'past';
  }

  return index === nextIndex ? 'next' : 'future';
}

function groupRowsByYear(rows: ScheduleRow[]): Map<number, ScheduleRow[]> {
  const groups = new Map<number, ScheduleRow[]>();

  rows.forEach((row) => {
    const year = Number(row.date.slice(0, 4));
    groups.set(year, [...(groups.get(year) ?? []), row]);
  });

  return groups;
}

function emiCountDetail(monthsSaved: number, originalMonths: number): string {
  if (monthsSaved === 0) {
    return `Same as the original ${originalMonths}`;
  }

  return `${Math.abs(monthsSaved)} ${monthsSaved > 0 ? 'fewer' : 'more'} than the original ${originalMonths}`;
}
