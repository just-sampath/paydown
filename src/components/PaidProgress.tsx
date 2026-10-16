import { ArrowUpRight, Check, X } from 'lucide-react';
import { useEffect, useId, useRef, useState } from 'react';

import type { LoanAnalysis } from '../features/loan/loanEngine';
import {
  buildPaidProgress,
  type PaidProgress,
  type ProgressMeter,
} from '../features/loan/progressBreakdown';
import { formatDuration, formatInrShort, formatMonthYear } from '../utils/format';

type PaidProgressPanelProps = {
  analysis: LoanAnalysis;
};

/**
 * Shows the original principal as one loan journey and reveals the accounting
 * detail only when the user asks for it.
 */
export function PaidProgressPanel({ analysis }: PaidProgressPanelProps) {
  const progress = buildPaidProgress(analysis);
  const [open, setOpen] = useState(false);
  const titleId = useId();
  const triggerRef = useRef<HTMLButtonElement>(null);
  const closeRef = useRef<HTMLButtonElement>(null);
  const principalPercent = percent(progress.principal.filled, progress.principal.total);

  useEffect(() => {
    if (!open) {
      return undefined;
    }

    const previousOverflow = document.body.style.overflow;
    const trigger = triggerRef.current;
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKeyDown);
    closeRef.current?.focus();

    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
      trigger?.focus();
    };
  }, [open]);

  return (
    <section className="card loan-progress-card mt-6">
      <button
        aria-expanded={open}
        aria-haspopup="dialog"
        className="loan-progress-trigger"
        data-loan-progress-trigger=""
        ref={triggerRef}
        type="button"
        onClick={() => setOpen(true)}
      >
        <div className="loan-progress-topline">
          <div className="label">Loan progress</div>
          <span className="loan-progress-action">
            View breakdown <ArrowUpRight aria-hidden="true" size={17} />
          </span>
        </div>

        <div className="loan-progress-summary">
          <ProgressFigure label="Original loan" value={formatInrShort(progress.principal.total)} />
          <ProgressFigure
            accent="positive"
            detail={`${principalPercent.toFixed(1)}% repaid`}
            label="Repaid"
            value={formatInrShort(progress.principal.filled)}
          />
          <ProgressFigure
            accent="remaining"
            detail={`${analysis.remainingPaymentCount} payments left`}
            label="Left"
            value={formatInrShort(progress.principal.remaining)}
          />
        </div>

        <PrincipalTrack meter={progress.principal} />

        <div className="loan-progress-footer">
          <span>
            <Check aria-hidden="true" size={15} />
            Includes {formatInrShort(progress.prepaid.filled)} in part payments
          </span>
          <span>
            {formatInrShort(progress.cash.remaining)} scheduled through{' '}
            {formatMonthYear(analysis.actual.summary.payoffDate)}
          </span>
        </div>
      </button>

      {open ? (
        <LoanBreakdownDialog
          analysis={analysis}
          closeRef={closeRef}
          progress={progress}
          titleId={titleId}
          onClose={() => setOpen(false)}
        />
      ) : null}
    </section>
  );
}

function ProgressFigure({
  accent,
  detail,
  label,
  value,
}: {
  accent?: 'positive' | 'remaining';
  detail?: string;
  label: string;
  value: string;
}) {
  return (
    <div className={`loan-progress-figure ${accent ? `is-${accent}` : ''}`}>
      <span>{label}</span>
      <strong>{value}</strong>
      {detail ? <small>{detail}</small> : null}
    </div>
  );
}

function PrincipalTrack({ meter }: { meter: ProgressMeter }) {
  const emiPrincipal =
    meter.segments.find((segment) => segment.key === 'emi-principal')?.amount ?? 0;
  const partPayments =
    meter.segments.find((segment) => segment.key === 'part-payments')?.amount ?? 0;

  return (
    <div
      aria-label={`${formatInrShort(meter.filled)} principal repaid, ${formatInrShort(meter.remaining)} outstanding`}
      className="loan-principal-track"
      role="img"
    >
      <span
        className="loan-principal-segment is-emi"
        style={{ width: widthPercent(emiPrincipal, meter.total) }}
      />
      <span
        className="loan-principal-segment is-prepayment"
        style={{ width: widthPercent(partPayments, meter.total) }}
      />
      <span
        className="loan-principal-segment is-outstanding"
        style={{ width: widthPercent(meter.remaining, meter.total) }}
      />
    </div>
  );
}

function LoanBreakdownDialog({
  analysis,
  closeRef,
  progress,
  titleId,
  onClose,
}: {
  analysis: LoanAnalysis;
  closeRef: React.RefObject<HTMLButtonElement | null>;
  progress: PaidProgress;
  titleId: string;
  onClose: () => void;
}) {
  const principalPercent = percent(progress.principal.filled, progress.principal.total);
  const emiPrincipal = amountFor(progress.principal, 'emi-principal');
  const partPayments = amountFor(progress.principal, 'part-payments');
  const regularInterest = amountFor(progress.interest, 'emi-interest');
  const partPaymentInterest = amountFor(progress.interest, 'simple-interest');
  const preEmiInterest = amountFor(progress.interest, 'pre-emi');
  const emisPaid = amountFor(progress.cash, 'emi');
  const additionalInterest = amountFor(progress.cash, 'extra-interest');

  return (
    <div className="loan-breakdown-overlay" onClick={onClose}>
      <div
        aria-labelledby={titleId}
        aria-modal="true"
        className="loan-breakdown-dialog"
        data-paid-dialog=""
        role="dialog"
        onClick={(event) => event.stopPropagation()}
      >
        <header className="loan-breakdown-header">
          <div>
            <div className="label">Complete picture</div>
            <h3 id={titleId}>Your loan breakdown</h3>
            <p>Principal is the loan itself. Interest is the cost of paying it over time.</p>
          </div>
          <button
            aria-label="Close loan breakdown"
            className="icon-btn loan-breakdown-close"
            data-paid-close=""
            ref={closeRef}
            type="button"
            onClick={onClose}
          >
            <X aria-hidden="true" size={18} />
          </button>
        </header>

        <section className="loan-breakdown-hero">
          <div className="loan-breakdown-hero-copy">
            <div>
              <span>Original loan</span>
              <strong>{formatInrShort(progress.principal.total)}</strong>
            </div>
            <div className="loan-breakdown-repaid">
              <span>{principalPercent.toFixed(1)}% repaid</span>
              <strong>{formatInrShort(progress.principal.filled)}</strong>
            </div>
            <div>
              <span>Outstanding</span>
              <strong>{formatInrShort(progress.principal.remaining)}</strong>
            </div>
          </div>
          <PrincipalTrack meter={progress.principal} />
          <div className="loan-track-legend">
            <LegendItem className="is-emi" label="Through EMIs" value={emiPrincipal} />
            <LegendItem className="is-prepayment" label="Part payments" value={partPayments} />
            <LegendItem
              className="is-outstanding"
              label="Outstanding"
              value={progress.principal.remaining}
            />
          </div>
        </section>

        <div className="loan-breakdown-grid">
          <BreakdownCard
            eyebrow="Principal"
            title={formatInrShort(progress.principal.total)}
            rows={[
              { label: 'Repaid through EMIs', value: emiPrincipal },
              { label: 'Part payments', value: partPayments },
              {
                label: 'Outstanding principal',
                value: progress.principal.remaining,
                emphasis: true,
              },
            ]}
          />
          <BreakdownCard
            eyebrow="Interest"
            title={formatInrShort(progress.interest.total)}
            subtitle="Current-plan interest"
            rows={[
              { label: 'Paid to date', value: progress.interest.filled },
              { label: 'Regular interest paid', value: regularInterest },
              { label: 'Part-payment interest', value: partPaymentInterest },
              { label: 'Pre-EMI interest', value: preEmiInterest },
              { label: 'Still to pay', value: progress.interest.remaining, emphasis: true },
            ]}
          />
          <BreakdownCard
            wide
            eyebrow="Cash flow"
            title={formatInrShort(progress.cash.total)}
            subtitle="Lifetime outflow"
            rows={[
              { label: 'EMIs paid', value: emisPaid },
              { label: 'Part payments', value: partPayments },
              { label: 'Additional interest charges', value: additionalInterest },
              { label: 'Scheduled from today', value: progress.cash.remaining, emphasis: true },
            ]}
          />
        </div>

        <section className="loan-outlook">
          <div className="loan-outlook-heading">
            <div>
              <div className="label">Lifetime outlook</div>
              <h4>{analysis.remainingPaymentCount} payments left</h4>
            </div>
            <span>Payoff {formatMonthYear(analysis.actual.summary.payoffDate)}</span>
          </div>
          <div className="loan-outlook-grid">
            <OutlookStat label="Time saved" value={formatDuration(analysis.monthsSaved)} />
            <OutlookStat
              label="Original-plan interest"
              value={analysis.original.summary.totalInterest}
            />
            <OutlookStat accent label="Interest saved" value={analysis.interestSaved} />
          </div>
        </section>

        <p className="loan-breakdown-note">
          Interest estimates follow your current repayment plan and hold the latest rate constant.
        </p>
      </div>
    </div>
  );
}

function LegendItem({
  className,
  label,
  value,
}: {
  className: string;
  label: string;
  value: number;
}) {
  return (
    <div>
      <span className={`loan-legend-dot ${className}`} />
      <span>{label}</span>
      <strong>{formatInrShort(value)}</strong>
    </div>
  );
}

function BreakdownCard({
  eyebrow,
  rows,
  subtitle,
  title,
  wide = false,
}: {
  eyebrow: string;
  rows: Array<{ label: string; value: number; emphasis?: boolean }>;
  subtitle?: string;
  title: string;
  wide?: boolean;
}) {
  return (
    <section className={`loan-breakdown-card ${wide ? 'is-wide' : ''}`}>
      <div className="label">{eyebrow}</div>
      <div className="loan-breakdown-card-total">
        <strong>{title}</strong>
        {subtitle ? <span>{subtitle}</span> : null}
      </div>
      <div className="loan-breakdown-rows">
        {rows.map((row) => (
          <div className={row.emphasis ? 'is-emphasis' : ''} key={row.label}>
            <span>{row.label}</span>
            <strong>{formatInrShort(row.value)}</strong>
          </div>
        ))}
      </div>
    </section>
  );
}

function OutlookStat({
  accent = false,
  label,
  value,
}: {
  accent?: boolean;
  label: string;
  value: number | string;
}) {
  return (
    <div className={accent ? 'is-accent' : ''}>
      <span>{label}</span>
      <strong>{typeof value === 'number' ? formatInrShort(value) : value}</strong>
    </div>
  );
}

function amountFor(meter: ProgressMeter, key: string): number {
  return meter.segments.find((segment) => segment.key === key)?.amount ?? 0;
}

function percent(value: number, total: number): number {
  return total > 0 ? (value / total) * 100 : 0;
}

function widthPercent(value: number, total: number): string {
  return `${Math.max(0, percent(value, total))}%`;
}
