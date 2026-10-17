import type { LoanAnalysis } from '../features/loan/loanEngine';
import { buildPaidProgress, type ProgressMeter } from '../features/loan/progressBreakdown';
import { formatInrShort } from '../utils/format';

type PaidProgressPanelProps = {
  analysis: LoanAnalysis;
};

type Segment = { key: string; amount: number; color: string };

/**
 * Where the money stands today: principal, interest, and everything paid, each split into
 * paid so far and still to pay, with the whole-loan total on the current plan.
 *
 * Each figure appears once on the dashboard, so this card is the only place that shows
 * the amount still owed, the interest paid, and the lifetime totals.
 *
 * @param props - Panel props.
 * @param props.analysis - Loan analysis for today.
 * @returns Loan progress card.
 */
export function PaidProgressPanel({ analysis }: PaidProgressPanelProps) {
  const progress = buildPaidProgress(analysis);
  const { principal, interest, cash } = progress;
  const emiPrincipal = amountFor(principal, 'emi-principal');
  const partPayments = amountFor(principal, 'part-payments');
  const interestOutsideEmis = amountFor(cash, 'extra-interest');
  const principalSegment: Segment = {
    key: 'emi-principal',
    amount: emiPrincipal,
    color: 'var(--c-principal)',
  };
  const partPaymentSegment: Segment = {
    key: 'part-payments',
    amount: partPayments,
    color: 'var(--c-prepay)',
  };
  const interestSegment: Segment = {
    key: 'interest',
    amount: interest.filled,
    color: 'var(--c-interest)',
  };

  return (
    <section className="card" aria-labelledby="loan-progress-title">
      <div className="card-head">
        <div className="min-w-0">
          <div className="label">Loan progress</div>
          <h2 id="loan-progress-title">
            {percent(principal.filled, principal.total).toFixed(1)}% of the principal is repaid
          </h2>
          <p>What you have paid so far, what is still to come, and the whole loan.</p>
        </div>
      </div>

      <div className="meters">
        <Meter
          leftLabel="Still owed"
          meter={principal}
          name="Principal"
          paidLabel="repaid"
          segments={[principalSegment, partPaymentSegment]}
          totalLabel="Borrowed"
        />
        <Meter
          leftLabel="Still to come"
          meter={interest}
          name="Interest"
          paidLabel="paid"
          segments={[interestSegment]}
          totalLabel="Whole loan"
        />
        <Meter
          leftLabel="Still to pay"
          meter={cash}
          name="Everything you pay"
          paidLabel="paid"
          segments={[principalSegment, partPaymentSegment, interestSegment]}
          totalLabel="Whole loan"
        />
      </div>

      <ul className="legend">
        <li>
          <span className="swatch" style={{ background: 'var(--c-principal)' }} />
          Principal through EMIs <strong>{formatInrShort(emiPrincipal)}</strong>
        </li>
        <li>
          <span className="swatch" style={{ background: 'var(--c-prepay)' }} />
          Part payments <strong>{formatInrShort(partPayments)}</strong>
        </li>
        <li>
          <span className="swatch" style={{ background: 'var(--c-interest)' }} />
          Interest
        </li>
        <li>
          <span className="swatch is-outstanding-fill" />
          Still to pay
        </li>
      </ul>
      <p className="footnote">
        Interest includes {formatInrShort(interestOutsideEmis)} charged outside EMIs: on part
        payments and before the first EMI. Amounts still to pay assume today&apos;s rate holds until
        the last EMI.
      </p>
    </section>
  );
}

type MeterProps = {
  name: string;
  meter: ProgressMeter;
  segments: Segment[];
  paidLabel: string;
  leftLabel: string;
  totalLabel: string;
};

function Meter({ name, meter, segments, paidLabel, leftLabel, totalLabel }: MeterProps) {
  const paid = formatInrShort(meter.filled);
  const left = formatInrShort(meter.remaining);

  return (
    <div className="meter">
      <div className="label">{name}</div>
      <div className="meter-value">
        <strong>{paid}</strong> {paidLabel}
      </div>
      <div
        aria-label={`${name}: ${paid} ${paidLabel}, ${left} ${leftLabel.toLowerCase()}`}
        className="meter-track"
        role="img"
      >
        {segments.map((segment) => (
          <span
            key={segment.key}
            style={{ width: widthPercent(segment.amount, meter.total), background: segment.color }}
          />
        ))}
        <span
          className="is-outstanding-fill"
          style={{ width: widthPercent(meter.remaining, meter.total) }}
        />
      </div>
      <dl className="meter-figures">
        <div>
          <dt>{leftLabel}</dt>
          <dd>{left}</dd>
        </div>
        <div>
          <dt>{totalLabel}</dt>
          <dd>{formatInrShort(meter.total)}</dd>
        </div>
      </dl>
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
