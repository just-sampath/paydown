import { Percent, Trash2 } from 'lucide-react';
import type { CSSProperties } from 'react';

import { RateHistoryChart } from '../components/Charts';
import { DraftDateInput, DraftNumberInput } from '../components/DraftInputs';
import {
  AddEventForm,
  CounterfactualValue,
  EventStat,
  InterestEffect,
  LengthEffect,
  UndoNotice,
  useUndoable,
} from '../components/EventEditing';
import { Card, EmptyState, StatCard } from '../components/Primitives';
import type { LoanAnalysis, RateChange } from '../features/loan/loanEngine';
import { formatDate, formatInr, formatPercent, pluralize } from '../utils/format';
import { RATE_HINT, RATE_LIMITS, exampleRate, rateConflict } from '../utils/rates';
import { interestShift, timeShift } from '../utils/savings';

type RateChangesPageProps = {
  analysis: LoanAnalysis;
  rateChanges: RateChange[];
  onChange: (rateChanges: RateChange[]) => void;
};

const COLUMNS = {
  '--event-columns': '150px 110px minmax(0, 1fr) minmax(0, 1fr) 36px',
} as CSSProperties;

/**
 * Renders the floating-rate history and the editable list of rate changes.
 *
 * @param props - Rate change page props.
 * @param props.analysis - Loan analysis containing rate impacts.
 * @param props.rateChanges - Editable rate change list.
 * @param props.onChange - Callback for persisting rate changes.
 * @returns Rate changes page element.
 */
export function RateChangesPage({ analysis, rateChanges, onChange }: RateChangesPageProps) {
  const undo = useUndoable<RateChange>();
  const removed = undo.removed;
  const currentRate = analysis.nextRow?.rate ?? analysis.actual.rows.at(-1)?.rate ?? 0;
  const startRate = analysis.original.rows[0]?.rate ?? currentRate;
  const minDate = analysis.actual.rows[0]?.date ?? '';
  const category = analysis.rateCategoryImpact;
  const rowTotals = sumImpacts(analysis.rateImpacts);

  const remove = (index: number): void => {
    const item = rateChanges[index];
    if (item !== undefined) {
      undo.remember(
        item,
        `Rate change to ${formatPercent(item.rate)} on ${formatDate(item.date)} removed.`,
      );
      onChange(rateChanges.filter((_, itemIndex) => itemIndex !== index));
    }
  };

  return (
    <div className="content stack">
      {/* The longest figure goes first: on a phone the first card gets the full width. */}
      <div className="kpi-grid is-three">
        <StatCard
          label="If the rate had never changed"
          value={
            <CounterfactualValue months={category.monthsSaved} condition="without the changes" />
          }
          detail={`${interestShift(-category.interestSaved)}, with the same part payments`}
        />
        <StatCard
          label="Rate changes"
          value={rateChanges.length}
          detail={`${formatPercent(startRate)} at the start, ${formatPercent(currentRate)} now`}
        />
        <StatCard
          label="EMI"
          value={formatInr(analysis.actual.summary.baseEmi)}
          detail="Same since the first EMI"
        />
      </div>

      <Card eyebrow="Rate history" title="How your rate moved">
        <RateHistoryChart analysis={analysis} rateChanges={rateChanges} />
      </Card>

      <Card
        eyebrow="Your rate changes"
        title="What each change did"
        subtitle="Enter the date your bank's new rate took effect. Your EMI stays the same and the number of EMIs changes instead. Changes save as you type."
      >
        <div className="stack gap-4">
          {removed && (
            <UndoNotice
              key={removed.label}
              onDismiss={undo.forget}
              onUndo={() => {
                onChange(sortRates([...rateChanges, removed.item]));
                undo.forget();
              }}
            >
              {removed.label}
            </UndoNotice>
          )}

          {rateChanges.length === 0 ? (
            <EmptyState
              icon={<Percent size={32} />}
              title="No rate changes yet"
              hint="Add the date your bank changed the rate and the new rate."
            />
          ) : (
            <div className="event-list has-stats" style={COLUMNS}>
              <div className="event-row is-head" aria-hidden="true">
                <span>Effective from</span>
                <span>New rate</span>
                <span className="numeric">Loan length</span>
                <span className="numeric">Interest</span>
                <span />
              </div>
              {rateChanges.map((rateChange, index) => {
                const impact = analysis.rateImpacts[index];

                return (
                  <div className="event-row" key={`${rateChange.date}-${index}`}>
                    <DraftDateInput
                      ariaLabel={`Effective date of rate change ${index + 1}`}
                      min={minDate}
                      value={rateChange.date}
                      onCommit={(date) => onChange(updateRate(rateChanges, index, { date }))}
                    />
                    <DraftNumberInput
                      ariaLabel={`New rate for change ${index + 1}`}
                      invalidHint={RATE_HINT}
                      max={RATE_LIMITS.max}
                      min={RATE_LIMITS.min}
                      suffix="%"
                      value={rateChange.rate}
                      onCommit={(rate) => onChange(updateRate(rateChanges, index, { rate }))}
                    />
                    <div className="cell-stats">
                      <EventStat label="Loan length">
                        <LengthEffect months={impact?.monthsSaved ?? 0} />
                      </EventStat>
                      <EventStat label="Interest">
                        <InterestEffect amount={impact?.interestSaved ?? 0} />
                      </EventStat>
                    </div>
                    <button
                      aria-label={`Delete rate change ${index + 1}`}
                      className="icon-btn cell-action"
                      type="button"
                      onClick={() => remove(index)}
                    >
                      <Trash2 aria-hidden="true" size={15} />
                    </button>
                  </div>
                );
              })}
              <div className="event-row is-foot">
                <span className="cell-foot-label">
                  All {pluralize(rateChanges.length, 'change')}
                </span>
                <div className="cell-stats">
                  <EventStat label="Loan length">
                    <LengthEffect months={rowTotals.months} />
                  </EventStat>
                  <EventStat label="Interest">
                    <InterestEffect amount={rowTotals.interest} />
                  </EventStat>
                </div>
                <span />
              </div>
            </div>
          )}

          <p className="footnote m-0">
            Each row counts only what that change did on top of every earlier change, part payments
            included. Add these rows to the ones on the Part payments page and you get the full move
            on the dashboard: {timeShift(analysis.monthsSaved)} and{' '}
            {interestShift(analysis.interestSaved)}. The card at the top asks a different question,
            so its figure differs.
          </p>

          <AddEventForm
            defaultDate={analysis.nextRow?.date ?? minDate}
            idPrefix="new-rate"
            check={(date, rate) => rateConflict(date, rate, startRate, rateChanges)}
            maxValue={RATE_LIMITS.max}
            minDate={minDate}
            minValue={RATE_LIMITS.min}
            submitLabel="Add rate change"
            valueLabel="New rate"
            valueExample={exampleRate(currentRate)}
            valueHint={RATE_HINT}
            valueSuffix="%"
            onAdd={(date, rate) => {
              undo.forget();
              onChange(sortRates([...rateChanges, { date, rate }]));
            }}
          />
        </div>
      </Card>
    </div>
  );
}

function sumImpacts(impacts: Array<{ monthsSaved: number; interestSaved: number } | undefined>) {
  return impacts.reduce(
    (sum, impact) => ({
      months: sum.months + (impact?.monthsSaved ?? 0),
      interest: sum.interest + (impact?.interestSaved ?? 0),
    }),
    { months: 0, interest: 0 },
  );
}

function updateRate(
  rateChanges: RateChange[],
  index: number,
  patch: Partial<RateChange>,
): RateChange[] {
  return sortRates(
    rateChanges.map((item, itemIndex) => (itemIndex === index ? { ...item, ...patch } : item)),
  );
}

function sortRates(rateChanges: RateChange[]): RateChange[] {
  return [...rateChanges].sort((left, right) => left.date.localeCompare(right.date));
}
