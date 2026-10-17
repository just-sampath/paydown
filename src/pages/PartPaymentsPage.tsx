import { HandCoins, Trash2 } from 'lucide-react';
import type { CSSProperties } from 'react';

import { DraftDateInput, DraftNumberInput } from '../components/DraftInputs';
import {
  AddEventForm,
  EventStat,
  InterestEffect,
  LengthEffect,
  UndoNotice,
  useUndoable,
} from '../components/EventEditing';
import { Card, EmptyState, StatCard } from '../components/Primitives';
import type { LoanAnalysis, PartPayment, PartPaymentImpact } from '../features/loan/loanEngine';
import { formatDate, formatInr, formatInrShort, formatMonthYear, pluralize } from '../utils/format';
import { interestShift, lengthShift, timeShift } from '../utils/savings';

type PartPaymentsPageProps = {
  analysis: LoanAnalysis;
  partPayments: PartPayment[];
  onChange: (partPayments: PartPayment[]) => void;
};

const AMOUNT_HINT = 'Enter an amount of at least ₹1.';

const COLUMNS = {
  '--event-columns':
    '150px 150px minmax(0, 1fr) minmax(0, 1fr) minmax(0, 0.8fr) minmax(0, 0.9fr) 36px',
} as CSSProperties;

/**
 * Renders the part-payment ledger with what each payment did to the loan.
 *
 * @param props - Part-payment page props.
 * @param props.analysis - Loan analysis containing prepayment impacts.
 * @param props.partPayments - Editable prepayment list.
 * @param props.onChange - Callback for persisting prepayments.
 * @returns Part payments page element.
 */
export function PartPaymentsPage({ analysis, partPayments, onChange }: PartPaymentsPageProps) {
  const undo = useUndoable<PartPayment>();
  const removed = undo.removed;
  const minDate = analysis.actual.rows[0]?.date ?? '';
  const category = analysis.partPaymentCategoryImpact;
  const totals = sumImpacts(analysis.partPaymentImpacts);
  const totalPaid = partPayments.reduce((sum, payment) => sum + payment.amount, 0);
  const best = bestPayment(partPayments, analysis.partPaymentImpacts);

  const remove = (index: number): void => {
    const item = partPayments[index];
    if (item !== undefined) {
      undo.remember(
        item,
        `Part payment of ${formatInrShort(item.amount)} on ${formatDate(item.date)} removed.`,
      );
      onChange(partPayments.filter((_, itemIndex) => itemIndex !== index));
    }
  };

  return (
    <div className="content stack">
      {/* The longest figure goes first: on a phone the first card gets the full width. */}
      <div className="kpi-grid is-three">
        <StatCard
          label="If you had made none"
          value={category.monthsSaved === 0 ? 'Same length' : lengthShift(-category.monthsSaved)}
          detail={`${interestShift(-category.interestSaved)}, with the same rate changes`}
        />
        <StatCard
          label="Paid on top of EMIs"
          value={formatInrShort(totalPaid)}
          detail={`Across ${pluralize(partPayments.length, 'part payment')}`}
        />
        <StatCard
          label="Best value"
          value={best ? formatMonthYear(best.date) : 'None yet'}
          detail={
            best
              ? 'This payment saved the most interest for each rupee paid'
              : 'Add a part payment to see what it saves'
          }
        />
      </div>

      <Card
        eyebrow="Your part payments"
        title="What each payment did"
        subtitle="Enter the date the bank posted the payment. Part-payment interest runs up to that day. Changes save as you type."
      >
        <div className="stack gap-4">
          {removed && (
            <UndoNotice
              key={removed.label}
              onDismiss={undo.forget}
              onUndo={() => {
                onChange(sortPayments([...partPayments, removed.item]));
                undo.forget();
              }}
            >
              {removed.label}
            </UndoNotice>
          )}

          {partPayments.length === 0 ? (
            <EmptyState
              icon={<HandCoins size={32} />}
              title="No part payments yet"
              hint="Add a lump sum you paid on top of an EMI to see how much time and interest it saves."
            />
          ) : (
            <div className="event-list has-stats is-wide" style={COLUMNS}>
              <div className="event-row is-head" aria-hidden="true">
                <span>Date</span>
                <span>Amount</span>
                <span className="numeric">Loan length</span>
                <span className="numeric">Interest</span>
                <span className="numeric">Saved per ₹1</span>
                <span className="numeric">Part-payment interest</span>
                <span />
              </div>
              {partPayments.map((payment, index) => (
                <PaymentRow
                  impact={analysis.partPaymentImpacts[index]}
                  index={index}
                  key={`${payment.date}-${index}`}
                  minDate={minDate}
                  payment={payment}
                  onRemove={() => remove(index)}
                  onUpdate={(patch) => onChange(updatePayment(partPayments, index, patch))}
                />
              ))}
              <div className="event-row is-foot">
                <span className="cell-foot-label">
                  All {pluralize(partPayments.length, 'payment')}
                </span>
                <div className="cell-stats">
                  <EventStat label="Loan length">
                    <LengthEffect months={totals.months} />
                  </EventStat>
                  <EventStat label="Interest">
                    <InterestEffect amount={totals.interest} />
                  </EventStat>
                  <EventStat label="Saved per ₹1">
                    {totalPaid > 0 ? `₹${(totals.interest / totalPaid).toFixed(2)}` : '₹0.00'}
                  </EventStat>
                  <EventStat label="Part-payment interest">
                    {formatInr(totals.simpleInterest)}
                  </EventStat>
                </div>
                <span />
              </div>
            </div>
          )}

          <p className="footnote m-0">
            Each row counts only what that payment did on top of every earlier change, rate changes
            included. Add these rows to the ones on the Rate changes page and you get the full move
            on the dashboard: {timeShift(analysis.monthsSaved)} and{' '}
            {interestShift(analysis.interestSaved)}. The card at the top asks a different question,
            so its figure differs.
          </p>

          <AddEventForm
            defaultDate={analysis.nextRow?.date ?? minDate}
            idPrefix="new-payment"
            minDate={minDate}
            minValue={1}
            submitLabel="Add part payment"
            valueHint={AMOUNT_HINT}
            valueLabel="Amount"
            valuePlaceholder="1,00,000"
            valuePrefix="₹"
            onAdd={(date, amount) => {
              undo.forget();
              onChange(sortPayments([...partPayments, { date, amount }]));
            }}
          />
        </div>
      </Card>
    </div>
  );
}

type PaymentRowProps = {
  payment: PartPayment;
  impact: PartPaymentImpact | undefined;
  index: number;
  minDate: string;
  onUpdate: (patch: Partial<PartPayment>) => void;
  onRemove: () => void;
};

function PaymentRow({ payment, impact, index, minDate, onUpdate, onRemove }: PaymentRowProps) {
  const interestSaved = impact?.interestSaved ?? 0;

  return (
    <div className="event-row">
      <DraftDateInput
        ariaLabel={`Date of part payment ${index + 1}`}
        min={minDate}
        value={payment.date}
        onCommit={(date) => onUpdate({ date })}
      />
      <DraftNumberInput
        ariaLabel={`Amount of part payment ${index + 1}`}
        grouped
        invalidHint={AMOUNT_HINT}
        min={1}
        prefix="₹"
        value={payment.amount}
        onCommit={(amount) => onUpdate({ amount })}
      />
      <div className="cell-stats">
        <EventStat label="Loan length">
          <LengthEffect months={impact?.monthsSaved ?? 0} />
        </EventStat>
        <EventStat label="Interest">
          <InterestEffect amount={interestSaved} />
        </EventStat>
        <EventStat label="Saved per ₹1">
          {payment.amount > 0 ? `₹${(interestSaved / payment.amount).toFixed(2)}` : '₹0.00'}
        </EventStat>
        <EventStat label="Part-payment interest">
          {formatInr(impact?.simpleInterest ?? 0)}
        </EventStat>
      </div>
      <button
        aria-label={`Delete part payment ${index + 1}`}
        className="icon-btn cell-action"
        type="button"
        onClick={onRemove}
      >
        <Trash2 aria-hidden="true" size={15} />
      </button>
    </div>
  );
}

function bestPayment(payments: PartPayment[], impacts: PartPaymentImpact[]) {
  return payments.reduce<{ date: string; ratio: number } | undefined>((best, payment, index) => {
    const ratio = payment.amount > 0 ? (impacts[index]?.interestSaved ?? 0) / payment.amount : 0;
    return best === undefined || ratio > best.ratio ? { date: payment.date, ratio } : best;
  }, undefined);
}

function sumImpacts(impacts: Array<PartPaymentImpact | undefined>) {
  return impacts.reduce(
    (sum, impact) => ({
      months: sum.months + (impact?.monthsSaved ?? 0),
      interest: sum.interest + (impact?.interestSaved ?? 0),
      simpleInterest: sum.simpleInterest + (impact?.simpleInterest ?? 0),
    }),
    { months: 0, interest: 0, simpleInterest: 0 },
  );
}

function updatePayment(
  partPayments: PartPayment[],
  index: number,
  patch: Partial<PartPayment>,
): PartPayment[] {
  return sortPayments(
    partPayments.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
  );
}

function sortPayments(partPayments: PartPayment[]): PartPayment[] {
  return [...partPayments].sort((left, right) => left.date.localeCompare(right.date));
}
