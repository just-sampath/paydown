import { useState } from 'react';

type DraftDateInputProps = {
  value: string;
  onCommit: (value: string) => void;
  ariaLabel: string;
  className?: string;
  min?: string;
};

export function DraftDateInput({ ...props }: DraftDateInputProps) {
  return <DraftDateField key={props.value} {...props} />;
}

function DraftDateField({
  value,
  onCommit,
  ariaLabel,
  className = 'input',
  min,
}: DraftDateInputProps) {
  const [draft, setDraft] = useState(value);
  const valid = isValidIsoDate(draft) && (min === undefined || draft >= min);

  return (
    <input
      aria-invalid={!valid}
      aria-label={ariaLabel}
      className={className}
      min={min}
      type="date"
      value={draft}
      onChange={(event) => {
        const raw = event.target.value;
        setDraft(raw);
        if (isValidIsoDate(raw) && (min === undefined || raw >= min)) {
          onCommit(raw);
        }
      }}
    />
  );
}

type DraftNumberInputProps = {
  value: number;
  onCommit: (value: number) => void;
  ariaLabel: string;
  className?: string;
  min?: number;
  step: number;
};

export function DraftNumberInput({ ...props }: DraftNumberInputProps) {
  return <DraftNumberField key={props.value} {...props} />;
}

function DraftNumberField({
  value,
  onCommit,
  ariaLabel,
  className = 'input',
  min = 0,
  step,
}: DraftNumberInputProps) {
  const [draft, setDraft] = useState(String(value));
  const parsed = Number(draft);
  const valid = draft.trim() !== '' && Number.isFinite(parsed) && parsed >= min;

  return (
    <input
      aria-invalid={!valid}
      aria-label={ariaLabel}
      className={className}
      min={min}
      step={step}
      type="number"
      value={draft}
      onChange={(event) => {
        const raw = event.target.value;
        const next = Number(raw);
        setDraft(raw);
        if (raw.trim() !== '' && Number.isFinite(next) && next >= min) {
          onCommit(next);
        }
      }}
    />
  );
}

function isValidIsoDate(date: string): boolean {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);

  if (match === null) {
    return false;
  }

  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return month >= 1 && month <= 12 && day >= 1 && day <= lastDay;
}
