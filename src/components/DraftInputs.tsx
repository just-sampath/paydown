import { useId, useState, type KeyboardEvent, type ReactNode } from 'react';

import { classNames } from '../utils/classNames';
import { formatGrouped } from '../utils/format';

type DraftDateInputProps = {
  value: string;
  onCommit: (value: string) => void;
  ariaLabel?: string;
  id?: string;
  className?: string;
  min?: string;
};

/**
 * Date field that keeps what the user is typing local and commits on blur or Enter.
 *
 * Committing on every keystroke would re-sort the parent list mid-edit and move the row
 * out from under the cursor, so a date only reaches the loan engine once the user leaves
 * the field with a valid calendar date.
 */
export function DraftDateInput({
  value,
  onCommit,
  ariaLabel,
  id,
  className = 'input',
  min,
}: DraftDateInputProps) {
  const [draft, setDraft] = useState(value);
  const [editing, setEditing] = useState(false);
  const shown = editing ? draft : value;
  const valid = isValidDate(shown, min);

  const finish = (): void => {
    setEditing(false);
    if (isValidDate(draft, min) && draft !== value) {
      onCommit(draft);
    }
  };

  return (
    <input
      aria-invalid={!valid}
      aria-label={ariaLabel}
      className={className}
      id={id}
      min={min}
      type="date"
      value={shown}
      onBlur={finish}
      onChange={(event) => {
        setEditing(true);
        setDraft(event.target.value);
      }}
      onFocus={() => {
        setDraft(value);
        setEditing(true);
      }}
      onKeyDown={(event) => commitOnEnter(event, finish)}
    />
  );
}

type DraftNumberInputProps = {
  value: number;
  onCommit: (value: number) => void;
  ariaLabel?: string;
  id?: string;
  className?: string;
  /** Smallest value that may be committed. */
  min?: number;
  /** Largest value that may be committed. */
  max?: number;
  /** Shown under the field while the typed text can't be committed. */
  invalidHint?: string;
  /** Show Indian digit grouping while the field is not being edited. */
  grouped?: boolean;
  prefix?: ReactNode;
  suffix?: ReactNode;
};

/**
 * Number field that commits every valid value as the user types without remounting.
 *
 * While the field has focus it shows the raw text the user typed, so a half-typed value
 * such as "8." stays put. Invalid or empty text never reaches the loan engine; leaving the
 * field puts the last committed value back.
 */
export function DraftNumberInput({
  value,
  onCommit,
  ariaLabel,
  id,
  className = 'input',
  min = 0,
  max = Number.POSITIVE_INFINITY,
  invalidHint,
  grouped = false,
  prefix,
  suffix,
}: DraftNumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const [editing, setEditing] = useState(false);
  const hintId = useId();
  const shown = editing ? draft : formatValue(value, grouped);
  const valid = parseDraft(shown, min, max) !== undefined;
  const showHint = !valid && invalidHint !== undefined;

  const input = (
    <input
      aria-describedby={showHint ? hintId : undefined}
      aria-invalid={!valid}
      aria-label={ariaLabel}
      autoComplete="off"
      className={classNames(className, 'numeric')}
      id={id}
      inputMode="decimal"
      type="text"
      value={shown}
      onBlur={() => setEditing(false)}
      onChange={(event) => {
        const raw = event.target.value;
        const next = parseDraft(raw, min, max);
        setEditing(true);
        setDraft(raw);
        if (next !== undefined && next !== value) {
          onCommit(next);
        }
      }}
      onFocus={(event) => {
        setDraft(String(value));
        setEditing(true);
        event.currentTarget.select();
      }}
      onKeyDown={(event) => commitOnEnter(event, () => event.currentTarget.blur())}
    />
  );

  const field =
    prefix === undefined && suffix === undefined ? (
      input
    ) : (
      <span className="field-adorned">
        {prefix !== undefined && <span className="field-affix">{prefix}</span>}
        {input}
        {suffix !== undefined && <span className="field-affix">{suffix}</span>}
      </span>
    );

  if (invalidHint === undefined) {
    return field;
  }

  // The wrapper is always rendered when a hint exists, so the input never remounts (and
  // never loses focus) when the hint appears or goes away.
  return (
    <span className="field-stack">
      {field}
      {showHint && (
        <span className="field-error" id={hintId}>
          {invalidHint}
        </span>
      )}
    </span>
  );
}

/**
 * Parses user text into a committed number, ignoring digit-grouping commas.
 *
 * @param raw - Text from the input.
 * @param min - Smallest accepted value.
 * @param max - Largest accepted value.
 * @returns The number, or `undefined` when the text is empty, not finite, or out of range.
 */
export function parseDraft(
  raw: string,
  min: number,
  max = Number.POSITIVE_INFINITY,
): number | undefined {
  const cleaned = raw.replace(/,/g, '').trim();
  const parsed = Number(cleaned);

  if (cleaned === '' || !Number.isFinite(parsed) || parsed < min || parsed > max) {
    return undefined;
  }

  return parsed;
}

/**
 * Checks for a real `YYYY-MM-DD` calendar date on or after `min`.
 *
 * @param date - Candidate ISO date.
 * @param min - Earliest accepted ISO date.
 * @returns Whether the date can be committed.
 */
export function isValidDate(date: string, min?: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const realDate = month >= 1 && month <= 12 && day >= 1 && day <= lastDay;

  return realDate && (min === undefined || date >= min);
}

function formatValue(value: number, grouped: boolean): string {
  return grouped ? formatGrouped(value) : String(value);
}

function commitOnEnter(event: KeyboardEvent<HTMLInputElement>, commit: () => void): void {
  if (event.key === 'Enter') {
    event.preventDefault();
    commit();
  }
}
