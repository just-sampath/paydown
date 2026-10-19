import { useId, useState } from 'react';

import type { LoanProfile } from '../features/vault/loanProfile';
import {
  AMOUNT_LIMITS,
  AMOUNT_TERM_HINT,
  cleanName,
  NAME_HINT,
  PRE_EMI_HINT,
  RATE_HINT,
  RATE_LIMITS,
  startDateHint,
  TENURE_HINT,
  TENURE_LIMITS,
  termsOf,
  withTerms,
  type LoanTerms,
} from '../utils/loanTerms';
import { DraftDateInput, DraftNumberInput } from './DraftInputs';

type LoanTermsEditorProps = {
  profile: LoanProfile;
  onChange: (profile: LoanProfile) => void;
};

/**
 * Edits a loan's own terms: name, lender, amount, starting rate, term, first EMI and
 * pre-EMI interest. Every change is checked against the whole loan, events included,
 * before it is committed, so the schedule can always be built.
 *
 * @param props - Editor props.
 * @param props.profile - Loan whose terms are shown.
 * @param props.onChange - Receives the whole profile with the new terms.
 * @returns Terms editor element.
 */
export function LoanTermsEditor({ profile, onChange }: LoanTermsEditorProps) {
  const terms = termsOf(profile);
  const [refused, setRefused] = useState<keyof LoanTerms | null>(null);
  const startHint = startDateHint(profile);

  const commit = (change: Partial<LoanTerms>): void => {
    const next = withTerms(profile, { ...terms, ...change });
    const field = Object.keys(change)[0] as keyof LoanTerms;

    if (next === undefined) {
      setRefused(field);
      return;
    }

    setRefused(null);
    onChange(next);
  };

  return (
    <div className="terms-form">
      <TextTerm label="Loan name" value={terms.name} onCommit={(name) => commit({ name })} />
      <TextTerm label="Lender" value={terms.lender} onCommit={(lender) => commit({ lender })} />
      <NumberTerm
        grouped
        hint={AMOUNT_TERM_HINT}
        label="Amount borrowed"
        limits={AMOUNT_LIMITS}
        prefix="₹"
        value={terms.principal}
        onCommit={(principal) => commit({ principal })}
      />
      <NumberTerm
        hint={RATE_HINT}
        label="Starting rate"
        limits={RATE_LIMITS}
        suffix="%"
        value={terms.originalRate}
        onCommit={(originalRate) => commit({ originalRate })}
      />
      <NumberTerm
        hint={TENURE_HINT}
        label="Original term"
        limits={TENURE_LIMITS}
        suffix="EMIs"
        value={terms.tenureMonths}
        onCommit={(tenureMonths) =>
          Number.isInteger(tenureMonths) ? commit({ tenureMonths }) : setRefused('tenureMonths')
        }
        refused={refused === 'tenureMonths'}
      />
      <DateTerm
        hint={startHint}
        label="First EMI"
        refused={refused === 'startDate'}
        value={terms.startDate}
        onCommit={(startDate) => commit({ startDate })}
      />
      <NumberTerm
        grouped
        hint={PRE_EMI_HINT}
        label="Pre-EMI interest"
        limits={{ min: 0, max: Number.POSITIVE_INFINITY }}
        prefix="₹"
        value={terms.preEmiInterest}
        onCommit={(preEmiInterest) => commit({ preEmiInterest })}
      />
    </div>
  );
}

function TextTerm({
  label,
  value,
  onCommit,
}: {
  label: string;
  value: string;
  onCommit: (value: string) => void;
}) {
  const id = useId();
  const hintId = useId();
  const [draft, setDraft] = useState<string | null>(null);
  const shown = draft ?? value;
  const valid = cleanName(shown) !== undefined;

  const finish = (): void => {
    const cleaned = cleanName(shown);
    setDraft(null);
    if (cleaned !== undefined && cleaned !== value) {
      onCommit(cleaned);
    }
  };

  return (
    <div className="field-row">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <span className="field-stack">
        <input
          aria-describedby={valid ? undefined : hintId}
          aria-invalid={!valid}
          autoComplete="off"
          className="input"
          id={id}
          value={shown}
          onBlur={finish}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              event.currentTarget.blur();
            }
          }}
        />
        {!valid && (
          <span className="field-error" id={hintId}>
            {NAME_HINT}
          </span>
        )}
      </span>
    </div>
  );
}

function NumberTerm({
  label,
  value,
  limits,
  hint,
  onCommit,
  refused = false,
  grouped,
  prefix,
  suffix,
}: {
  label: string;
  value: number;
  limits: { min: number; max: number };
  hint: string;
  onCommit: (value: number) => void;
  refused?: boolean;
  grouped?: boolean;
  prefix?: string;
  suffix?: string;
}) {
  const id = useId();

  return (
    <div className="field-row">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <DraftNumberInput
        grouped={grouped}
        id={id}
        invalidHint={hint}
        max={limits.max}
        min={limits.min}
        prefix={prefix}
        suffix={suffix}
        value={value}
        onCommit={onCommit}
      />
      {refused && <span className="field-error">{hint}</span>}
    </div>
  );
}

function DateTerm({
  label,
  value,
  hint,
  refused,
  onCommit,
}: {
  label: string;
  value: string;
  hint: string | undefined;
  refused: boolean;
  onCommit: (value: string) => void;
}) {
  const id = useId();
  const hintId = useId();

  return (
    <div className="field-row">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <span className="field-stack">
        <DraftDateInput id={id} value={value} onCommit={onCommit} />
        {refused && hint !== undefined && (
          <span className="field-error" id={hintId} role="alert">
            {hint}
          </span>
        )}
      </span>
    </div>
  );
}
