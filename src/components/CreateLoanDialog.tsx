import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import type { LoanProfile } from '../features/vault/loanProfile';
import { passphraseProblem, suggestPassphrase } from '../features/vault/passphrase';
import {
  AMOUNT_LIMITS,
  AMOUNT_TERM_HINT,
  cleanName,
  earliestEventDate,
  NAME_HINT,
  PRE_EMI_HINT,
  RATE_HINT,
  RATE_LIMITS,
  startDateHint,
  TENURE_HINT,
  TENURE_LIMITS,
  termsOf,
  withTerms,
} from '../utils/loanTerms';
import { isValidDate, parseDraft } from './DraftInputs';
import { ModalOverlay, useModal } from './Modal';

type CreateLoanDialogProps = {
  /** The sample as it is now, offered as a starting point when it is showing. */
  sample?: LoanProfile;
  onCreate: (
    profile: LoanProfile,
    passphrase: string,
    remember: boolean,
    fromSample: boolean,
  ) => Promise<void>;
  onClose: () => void;
};

type Fields = {
  name: string;
  lender: string;
  principal: string;
  originalRate: string;
  tenureMonths: string;
  startDate: string;
  preEmiInterest: string;
};

type FieldErrors = Partial<Record<keyof Fields, string>>;

const BLANK: Fields = {
  name: 'My loan',
  lender: '',
  principal: '',
  originalRate: '',
  tenureMonths: '',
  startDate: '',
  preEmiInterest: '',
};

/**
 * Starts the visitor's own loan: its terms, then a passphrase that encrypts it on this
 * device. The passphrase only lives in this component's state and is cleared on submit.
 *
 * @param props - Dialog props.
 * @param props.sample - The sample as it is now, which can be taken over.
 * @param props.onCreate - Encrypts and opens the new loan; rejects on failure.
 * @param props.onClose - Closes the dialog.
 * @returns Create loan dialog element.
 */
export function CreateLoanDialog({ sample, onCreate, onClose }: CreateLoanDialogProps) {
  const [fromSample, setFromSample] = useState(false);
  const [fields, setFields] = useState<Fields>(BLANK);
  const [passphrase, setPassphrase] = useState('');
  const [confirm, setConfirm] = useState('');
  const [suggested, setSuggested] = useState<string | null>(null);
  const [remember, setRemember] = useState(false);
  const [attempted, setAttempted] = useState(false);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const firstRef = useRef<HTMLInputElement>(null);
  const formRef = useModal<HTMLFormElement>({ onClose, locked: pending, initialFocus: firstRef });

  const base = fromSample && sample !== undefined ? sample : blankProfile();
  const errors = attempted ? fieldErrors(fields, base) : {};
  const passphraseError = attempted ? passphraseCheck(passphrase, confirm) : undefined;

  const chooseStart = (useSample: boolean): void => {
    setFromSample(useSample);
    setFields(useSample && sample !== undefined ? fieldsOf(sample) : BLANK);
  };

  const submit = async (event: FormEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    setAttempted(true);
    const profile = buildProfile(fields, base);

    if (pending || profile === undefined || passphraseCheck(passphrase, confirm) !== undefined) {
      const onlyCombination =
        profile === undefined && Object.keys(fieldErrors(fields, base)).length === 0;
      setError(onlyCombination ? "These terms don't make a loan that can be paid off." : null);
      return;
    }

    const secret = passphrase;
    setPassphrase('');
    setConfirm('');
    setSuggested(null);
    setPending(true);
    setError(null);

    try {
      await onCreate(profile, secret, remember, fromSample);
      onClose();
    } catch (createError) {
      setError((createError as Error).message);
      setPending(false);
    }
  };

  const set = (key: keyof Fields) => (value: string) =>
    setFields((current) => ({ ...current, [key]: value }));

  return (
    <ModalOverlay>
      <form
        aria-describedby="create-description"
        aria-labelledby="create-title"
        aria-modal="true"
        className="modal modal-wide"
        method="post"
        noValidate
        onSubmit={(event) => void submit(event)}
        ref={formRef}
        role="dialog"
      >
        <h2 className="modal-title" id="create-title">
          Start my own loan
        </h2>
        <p className="modal-body" id="create-description">
          Your loan is encrypted with a passphrase and saved only on this device. Nothing is sent
          anywhere. You can move it to another device with a link.
        </p>

        {sample !== undefined && (
          <fieldset className="modal-section" disabled={pending}>
            <legend className="field-label">Start from</legend>
            <div className="segmented">
              <button aria-pressed={!fromSample} onClick={() => chooseStart(false)} type="button">
                Blank
              </button>
              <button aria-pressed={fromSample} onClick={() => chooseStart(true)} type="button">
                The sample as it is now
              </button>
            </div>
            {fromSample && (
              <p className="subtle m-0 text-sm">
                Its rate changes, part payments and scenarios come along. The sample then goes back
                to its made-up figures.
              </p>
            )}
          </fieldset>
        )}

        <fieldset className="modal-section terms-form" disabled={pending}>
          <legend className="sr-only">Loan terms</legend>
          <Field error={errors.name} label="Loan name">
            {(id, describedBy) => (
              <input
                {...textProps(id, describedBy, errors.name)}
                ref={firstRef}
                value={fields.name}
                onChange={(event) => set('name')(event.target.value)}
              />
            )}
          </Field>
          <Field error={errors.lender} label="Lender">
            {(id, describedBy) => (
              <input
                {...textProps(id, describedBy, errors.lender)}
                value={fields.lender}
                onChange={(event) => set('lender')(event.target.value)}
              />
            )}
          </Field>
          <NumberField
            error={errors.principal}
            label="Amount borrowed"
            prefix="₹"
            value={fields.principal}
            onChange={set('principal')}
          />
          <NumberField
            error={errors.originalRate}
            label="Starting rate"
            suffix="%"
            value={fields.originalRate}
            onChange={set('originalRate')}
          />
          <NumberField
            error={errors.tenureMonths}
            label="Original term"
            suffix="EMIs"
            value={fields.tenureMonths}
            onChange={set('tenureMonths')}
          />
          <Field error={errors.startDate} label="First EMI">
            {(id, describedBy) => (
              <input
                {...textProps(id, describedBy, errors.startDate)}
                type="date"
                value={fields.startDate}
                onChange={(event) => set('startDate')(event.target.value)}
              />
            )}
          </Field>
          <NumberField
            error={errors.preEmiInterest}
            label="Pre-EMI interest (optional)"
            prefix="₹"
            value={fields.preEmiInterest}
            onChange={set('preEmiInterest')}
          />
        </fieldset>

        <fieldset className="modal-section" disabled={pending}>
          <legend className="field-label">Passphrase</legend>
          <p className="subtle m-0 text-sm">
            At least 20 characters. If you lose it, nobody can open your loan, not even you.
          </p>
          <PassphraseField
            error={passphraseError}
            label="Passphrase"
            value={passphrase}
            onChange={(value) => {
              setPassphrase(value);
              setSuggested(null);
            }}
          />
          <PassphraseField
            label="Repeat passphrase"
            value={confirm}
            onChange={(value) => {
              setConfirm(value);
              setSuggested(null);
            }}
          />
          <div className="flex flex-wrap items-center gap-2">
            <button
              className="btn btn-sm"
              onClick={() => {
                const next = suggestPassphrase();
                setPassphrase(next);
                setConfirm(next);
                setSuggested(next);
              }}
              type="button"
            >
              Suggest one
            </button>
            {suggested !== null && <SuggestedPassphrase value={suggested} />}
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input
              checked={remember}
              onChange={(event) => setRemember(event.target.checked)}
              type="checkbox"
            />
            Remember on this device
          </label>
        </fieldset>

        {error !== null && (
          <p className="mt-3 text-sm font-semibold text-[var(--error)]" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn" disabled={pending} onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={pending} type="submit">
            {pending ? 'Encrypting…' : 'Save my loan'}
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error: string | undefined;
  children: (id: string, describedBy: string | undefined) => ReactNode;
}) {
  const id = useId();
  const errorId = useId();

  return (
    <div className="field-row">
      <label className="field-label" htmlFor={id}>
        {label}
      </label>
      <span className="field-stack">
        {children(id, error === undefined ? undefined : errorId)}
        {error !== undefined && (
          <span className="field-error" id={errorId}>
            {error}
          </span>
        )}
      </span>
    </div>
  );
}

function NumberField({
  label,
  value,
  error,
  prefix,
  suffix,
  onChange,
}: {
  label: string;
  value: string;
  error: string | undefined;
  prefix?: string;
  suffix?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field error={error} label={label}>
      {(id, describedBy) => (
        <span className="field-adorned">
          {prefix !== undefined && <span className="field-affix">{prefix}</span>}
          <input
            {...textProps(id, describedBy, error)}
            className="input numeric"
            inputMode="decimal"
            value={value}
            onChange={(event) => onChange(event.target.value)}
          />
          {suffix !== undefined && <span className="field-affix">{suffix}</span>}
        </span>
      )}
    </Field>
  );
}

function PassphraseField({
  label,
  value,
  error,
  onChange,
}: {
  label: string;
  value: string;
  error?: string;
  onChange: (value: string) => void;
}) {
  return (
    <Field error={error} label={label}>
      {(id, describedBy) => (
        <input
          {...textProps(id, describedBy, error)}
          autoCapitalize="off"
          autoCorrect="off"
          spellCheck={false}
          type="password"
          value={value}
          onChange={(event) => onChange(event.target.value)}
        />
      )}
    </Field>
  );
}

function SuggestedPassphrase({ value }: { value: string }) {
  const [copied, setCopied] = useState(false);

  return (
    <span className="suggested-passphrase">
      <code>{value}</code>
      <button
        className="btn btn-sm"
        onClick={() => {
          void navigator.clipboard
            ?.writeText(value)
            .then(() => setCopied(true))
            .catch(() => undefined);
        }}
        type="button"
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <span className="subtle text-sm">Save it in a password manager now.</span>
    </span>
  );
}

function textProps(id: string, describedBy: string | undefined, error: string | undefined) {
  return {
    'aria-describedby': describedBy,
    'aria-invalid': error !== undefined,
    autoComplete: 'off',
    className: 'input',
    id,
  };
}

function blankProfile(): LoanProfile {
  return {
    schema: 1,
    meta: { name: 'My loan', lender: 'My lender', rateType: 'floating' },
    loan: {
      principal: AMOUNT_LIMITS.min,
      originalRate: RATE_LIMITS.min,
      tenureMonths: TENURE_LIMITS.min,
      startDate: '2000-01-01',
      rateChanges: [],
      partPayments: [],
    },
    scenarios: [],
  };
}

function fieldsOf(profile: LoanProfile): Fields {
  const terms = termsOf(profile);
  return {
    name: terms.name,
    lender: terms.lender,
    principal: String(terms.principal),
    originalRate: String(terms.originalRate),
    tenureMonths: String(terms.tenureMonths),
    startDate: terms.startDate,
    preEmiInterest: terms.preEmiInterest === 0 ? '' : String(terms.preEmiInterest),
  };
}

function fieldErrors(fields: Fields, base: LoanProfile): FieldErrors {
  const errors: FieldErrors = {};
  const tenure = parseDraft(fields.tenureMonths, TENURE_LIMITS.min, TENURE_LIMITS.max);

  const earliest = earliestEventDate(base);

  if (cleanName(fields.name) === undefined) {
    errors.name = NAME_HINT;
  }
  if (cleanName(fields.lender) === undefined) {
    errors.lender = NAME_HINT;
  }
  if (parseDraft(fields.principal, AMOUNT_LIMITS.min, AMOUNT_LIMITS.max) === undefined) {
    errors.principal = AMOUNT_TERM_HINT;
  }
  if (parseDraft(fields.originalRate, RATE_LIMITS.min, RATE_LIMITS.max) === undefined) {
    errors.originalRate = RATE_HINT;
  }
  if (tenure === undefined || !Number.isInteger(tenure)) {
    errors.tenureMonths = TENURE_HINT;
  }
  if (!isValidDate(fields.startDate)) {
    errors.startDate = 'Pick the date of your first EMI.';
  } else if (earliest !== undefined && fields.startDate > earliest) {
    errors.startDate = startDateHint(base);
  }
  if (fields.preEmiInterest.trim() !== '' && parseDraft(fields.preEmiInterest, 0) === undefined) {
    errors.preEmiInterest = PRE_EMI_HINT;
  }

  return errors;
}

function buildProfile(fields: Fields, base: LoanProfile): LoanProfile | undefined {
  return withTerms(base, {
    name: fields.name,
    lender: fields.lender,
    principal: parseDraft(fields.principal, 0) ?? Number.NaN,
    originalRate: parseDraft(fields.originalRate, 0) ?? Number.NaN,
    tenureMonths: parseDraft(fields.tenureMonths, 0) ?? Number.NaN,
    startDate: isValidDate(fields.startDate) ? fields.startDate : '',
    preEmiInterest:
      fields.preEmiInterest.trim() === '' ? 0 : (parseDraft(fields.preEmiInterest, 0) ?? -1),
  });
}

function passphraseCheck(passphrase: string, confirm: string): string | undefined {
  return (
    passphraseProblem(passphrase) ??
    (passphrase === confirm ? undefined : 'The two passphrases differ.')
  );
}
