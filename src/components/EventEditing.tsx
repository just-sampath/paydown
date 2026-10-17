import { Plus, Undo2, X } from 'lucide-react';
import { useEffect, useRef, useState, type FormEvent, type ReactNode } from 'react';

import { formatDate } from '../utils/format';
import { interestShift, lengthShift } from '../utils/savings';
import { isValidDate, parseDraft } from './DraftInputs';
import { toneClass, toneOf } from './Primitives';

type AddEventFormProps = {
  /** Distinguishes the field ids when two forms share a page. */
  idPrefix: string;
  defaultDate: string;
  minDate: string;
  valueLabel: string;
  valuePrefix?: string;
  valueSuffix?: string;
  valuePlaceholder: string;
  /** Smallest value that can be added. */
  minValue: number;
  /** Largest value that can be added. */
  maxValue?: number;
  /** Shown when the typed value is outside the allowed range. */
  valueHint: string;
  /** Returns a reason to refuse an otherwise valid event, such as a duplicate. */
  check?: (date: string, value: number) => string | undefined;
  submitLabel: string;
  onAdd: (date: string, value: number) => void;
};

/**
 * Inline form for adding one dated event, such as a rate change or a part payment.
 *
 * The value starts empty so the user always types a real figure; nothing is added until
 * both fields are valid, and a line under the form says what is wrong.
 */
export function AddEventForm({
  idPrefix,
  defaultDate,
  minDate,
  valueLabel,
  valuePrefix,
  valueSuffix,
  valuePlaceholder,
  minValue,
  maxValue,
  valueHint,
  check,
  submitLabel,
  onAdd,
}: AddEventFormProps) {
  const [date, setDate] = useState(defaultDate);
  const [value, setValue] = useState('');
  const parsed = parseDraft(value, minValue, maxValue);
  const problem = formProblem({ date, minDate, value, parsed, valueHint, check });
  const ready = problem === undefined && parsed !== undefined;
  const hintId = `${idPrefix}-hint`;

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    if (ready && parsed !== undefined) {
      onAdd(date, parsed);
      setValue('');
    }
  };

  return (
    <form className="add-form" onSubmit={submit}>
      <label className="add-form-field" htmlFor={`${idPrefix}-date`}>
        <span className="field-label">Date</span>
        <input
          aria-describedby={problem ? hintId : undefined}
          aria-invalid={!isValidDate(date, minDate)}
          className="input"
          id={`${idPrefix}-date`}
          min={minDate}
          type="date"
          value={date}
          onChange={(event) => setDate(event.target.value)}
        />
      </label>
      <label className="add-form-field" htmlFor={`${idPrefix}-value`}>
        <span className="field-label">{valueLabel}</span>
        <span className="field-adorned">
          {valuePrefix && <span className="field-affix">{valuePrefix}</span>}
          <input
            aria-describedby={problem ? hintId : undefined}
            aria-invalid={value !== '' && parsed === undefined}
            autoComplete="off"
            className="input numeric"
            id={`${idPrefix}-value`}
            inputMode="decimal"
            placeholder={valuePlaceholder}
            type="text"
            value={value}
            onChange={(event) => setValue(event.target.value)}
          />
          {valueSuffix && <span className="field-affix">{valueSuffix}</span>}
        </span>
      </label>
      <button className="btn btn-primary add-form-submit" disabled={!ready} type="submit">
        <Plus aria-hidden="true" size={16} />
        {submitLabel}
      </button>
      {problem && (
        <p className="field-error add-form-hint" id={hintId}>
          {problem}
        </p>
      )}
    </form>
  );
}

function formProblem({
  date,
  minDate,
  value,
  parsed,
  valueHint,
  check,
}: {
  date: string;
  minDate: string;
  value: string;
  parsed: number | undefined;
  valueHint: string;
  check?: (date: string, value: number) => string | undefined;
}): string | undefined {
  if (!isValidDate(date, minDate)) {
    return `Pick a date on or after ${formatDate(minDate)}.`;
  }

  if (value.trim() === '') {
    return undefined;
  }

  return parsed === undefined ? valueHint : check?.(date, parsed);
}

type UndoNoticeProps = {
  children: ReactNode;
  onUndo: () => void;
  onDismiss: () => void;
};

/**
 * Small notice shown after a delete so the user can put the item back.
 */
export function UndoNotice({ children, onUndo, onDismiss }: UndoNoticeProps) {
  const undoRef = useRef<HTMLButtonElement>(null);

  // The deleted row's button is gone, so hand keyboard focus to Undo instead of the page.
  useEffect(() => {
    undoRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <div className="undo-notice" role="status">
      <span>{children}</span>
      <div className="undo-notice-actions">
        <button className="btn btn-sm" ref={undoRef} type="button" onClick={onUndo}>
          <Undo2 aria-hidden="true" size={15} />
          Undo
        </button>
        <button
          aria-label="Dismiss"
          className="icon-btn icon-btn-sm"
          type="button"
          onClick={onDismiss}
        >
          <X aria-hidden="true" size={15} />
        </button>
      </div>
    </div>
  );
}

/**
 * Tracks the most recently removed list item so it can be restored.
 *
 * @returns The removed item (if any), a function to remember one, and a function to forget it.
 */
export function useUndoable<T>() {
  const [removed, setRemoved] = useState<{ item: T; label: string } | null>(null);

  return {
    removed,
    remember: (item: T, label: string) => setRemoved({ item, label }),
    forget: () => setRemoved(null),
  };
}

/**
 * One labelled figure inside an event row. The label only shows on narrow screens, where
 * the column headings are hidden.
 *
 * @param props - Stat props.
 * @param props.label - Column name.
 * @param props.children - Value to show.
 * @returns Event row cell.
 */
export function EventStat({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="event-stat">
      <span className="cell-label">{label}</span>
      {children}
    </div>
  );
}

/**
 * Change in loan length, coloured as good or bad news.
 *
 * @param props - Props.
 * @param props.months - Months taken off; negative when months were added.
 * @returns Text such as "8 mo shorter".
 */
export function LengthEffect({ months }: { months: number }) {
  return <span className={toneClass(toneOf(months))}>{lengthShift(months)}</span>;
}

/**
 * Change in interest, coloured as good or bad news.
 *
 * @param props - Props.
 * @param props.amount - Interest avoided; negative when interest was added.
 * @returns Text such as "₹3.45L less".
 */
export function InterestEffect({ amount }: { amount: number }) {
  return <span className={toneClass(toneOf(Math.round(amount)))}>{interestShift(amount, '')}</span>;
}
