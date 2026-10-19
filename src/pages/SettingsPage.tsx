import { Link2, Lock, Moon, Plus, RotateCcw, Sun, Trash2, Unlock } from 'lucide-react';
import { useId, useRef, useState, type FormEvent, type ReactNode } from 'react';

import type { DatasetId } from '../app/App';
import type { AppearancePrefs } from '../app/storage';
import { CreateLoanDialog } from '../components/CreateLoanDialog';
import { LoanTermsEditor } from '../components/LoanTermsEditor';
import { ConfirmDialog, ModalOverlay, useModal } from '../components/Modal';
import { Card } from '../components/Primitives';
import { UnlockDialog } from '../components/UnlockDialog';
import type { LoanAnalysis } from '../features/loan/loanEngine';
import type { LoanProfile } from '../features/vault/loanProfile';
import { linkTextFrom } from '../features/vault/vaultLink';
import { formatDuration, formatInr, formatPercent, pluralize } from '../utils/format';

type SettingsPageProps = {
  analysis: LoanAnalysis;
  profile: LoanProfile;
  datasetId: DatasetId;
  vaultAvailable: boolean;
  hasMyLoan: boolean;
  prefs: AppearancePrefs;
  onPrefsChange: (prefs: AppearancePrefs) => void;
  onProfileChange: (profile: LoanProfile) => void;
  onResetData: () => void;
  onUnlock: (passphrase: string, remember: boolean) => Promise<void>;
  onLock: () => Promise<void>;
  onUnlockMine: () => void;
  onCreateMyLoan: (
    profile: LoanProfile,
    passphrase: string,
    remember: boolean,
    fromSample: boolean,
  ) => Promise<void>;
  onOpenLink: (text: string) => void;
  onShareLink: () => Promise<string>;
  onRemoveMyLoan: () => Promise<void>;
};

const PALETTES: Array<{ id: AppearancePrefs['palette']; name: string; colors: string[] }> = [
  { id: 'carbon', name: 'Carbon', colors: ['#0b0a07', '#ffe15a', '#b8a3f0'] },
  { id: 'default', name: 'Navy', colors: ['#003d5b', '#25e2cc', '#f06000'] },
  { id: 'cocoa', name: 'Cocoa', colors: ['#5b2c20', '#e8946a', '#f2c879'] },
];

const TERMS_NOTE: Record<DatasetId, string> = {
  sample:
    "Change these to try other figures. The sample is kept on this device without a passphrase, so don't type your real loan here: use Start my own loan below.",
  mine: 'Every change is encrypted and saved on this device as you make it. Rate changes and part payments have their own pages.',
  'set-a':
    'Changes here last until you close this tab. Rate changes and part payments have their own pages.',
};

/**
 * Renders appearance controls, the loan's terms, and data controls.
 *
 * @param props - Settings props.
 * @param props.analysis - Loan analysis containing derived values.
 * @param props.profile - Active loan profile whose terms are shown and edited.
 * @param props.datasetId - Which loan is showing.
 * @param props.vaultAvailable - Whether this build contains an encrypted data set.
 * @param props.hasMyLoan - Whether this device holds the visitor's own encrypted loan.
 * @param props.prefs - Current appearance preferences.
 * @param props.onPrefsChange - Callback for theme and palette changes.
 * @param props.onProfileChange - Receives the profile with edited terms.
 * @param props.onResetData - Callback that clears persisted data.
 * @param props.onUnlock - Attempts to unlock set a.
 * @param props.onLock - Locks the open encrypted loan and forgets this device.
 * @param props.onUnlockMine - Opens the prompt for your own loan's passphrase.
 * @param props.onCreateMyLoan - Encrypts and opens a new loan of your own.
 * @param props.onOpenLink - Starts opening a pasted link.
 * @param props.onShareLink - Returns a link to your loan as it is saved now.
 * @param props.onRemoveMyLoan - Deletes your loan from this device.
 * @returns Settings page element.
 */
export function SettingsPage(props: SettingsPageProps) {
  const { analysis, profile, datasetId, prefs, onPrefsChange } = props;
  const { meta, loan } = profile;

  return (
    <div className="content stack">
      <Card eyebrow="Appearance" title="Theme and colours">
        <div className="settings-row">
          <span className="field-label" id="theme-label">
            Theme
          </span>
          <div className="segmented" role="group" aria-labelledby="theme-label">
            <ToggleButton
              pressed={prefs.theme === 'dark'}
              onClick={() => onPrefsChange({ ...prefs, theme: 'dark' })}
            >
              <Moon aria-hidden="true" size={15} />
              Dark
            </ToggleButton>
            <ToggleButton
              pressed={prefs.theme === 'light'}
              onClick={() => onPrefsChange({ ...prefs, theme: 'light' })}
            >
              <Sun aria-hidden="true" size={15} />
              Light
            </ToggleButton>
          </div>
        </div>
        <div className="settings-row">
          <span className="field-label" id="palette-label">
            Palette
          </span>
          <div className="segmented" role="group" aria-labelledby="palette-label">
            {PALETTES.map((palette) => (
              <ToggleButton
                key={palette.id}
                pressed={prefs.palette === palette.id}
                onClick={() => onPrefsChange({ ...prefs, palette: palette.id })}
              >
                <span aria-hidden="true" className="palette-dots">
                  {palette.colors.map((color) => (
                    <span key={color} style={{ background: color }} />
                  ))}
                </span>
                {palette.name}
              </ToggleButton>
            ))}
          </div>
        </div>
      </Card>

      <Card
        eyebrow="Loan terms"
        title={`${meta.name} from ${meta.lender}`}
        subtitle={TERMS_NOTE[datasetId]}
      >
        <LoanTermsEditor
          // A new loan starts with fresh fields, not the drafts of the last one.
          key={datasetId}
          profile={profile}
          onChange={props.onProfileChange}
        />
        <dl className="terms-grid mt-4">
          <Term label="EMI" value={formatInr(analysis.actual.summary.baseEmi)} />
          <Term
            label="EMI due on"
            value={`The ${ordinal(Number(loan.startDate.slice(8, 10)))} of each month`}
          />
          <Term label="Last EMI" value={formatInr(analysis.actual.rows.at(-1)?.emi ?? 0)} />
          <Term
            label="Original term"
            value={`${formatDuration(loan.tenureMonths)} (${pluralize(loan.tenureMonths, 'EMI')})`}
          />
          <Term label="Rate type" value={`Floating, from ${formatPercent(loan.originalRate)}`} />
          <Term label="When the rate changes" value="EMI stays, term moves" />
          <Term
            label="Part-payment interest"
            value={formatInr(analysis.actual.summary.totalSimpleInterest)}
          />
        </dl>
      </Card>

      <DataCard {...props} />
    </div>
  );
}

function DataCard(props: SettingsPageProps) {
  const { datasetId } = props;
  const [unlockingSetA, setUnlockingSetA] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const setAOpen = datasetId === 'set-a';

  return (
    <Card eyebrow="Data" title="Data on this device">
      {datasetId !== 'mine' && (
        <div className="settings-row is-action">
          <div>
            <div className="font-bold">Restore default data</div>
            <p className="subtle m-0 mt-1 text-sm">
              {setAOpen
                ? 'Drops the edits you made since set a was unlocked.'
                : 'Puts back the sample terms, rate changes and part payments and deletes the sample scenarios. Your theme stays as it is.'}
            </p>
          </div>
          <div className="flex justify-end">
            <button
              className="btn btn-quiet-danger"
              type="button"
              onClick={() => setConfirmingReset(true)}
            >
              <RotateCcw aria-hidden="true" size={16} />
              Restore default data
            </button>
          </div>
        </div>
      )}
      {confirmingReset && (
        <ConfirmDialog
          confirmLabel={setAOpen ? 'Drop edits' : 'Restore default data'}
          title={setAOpen ? 'Drop your edits to set a?' : 'Restore the default data?'}
          onCancel={() => setConfirmingReset(false)}
          onConfirm={() => {
            setConfirmingReset(false);
            props.onResetData();
          }}
        >
          {setAOpen
            ? 'Terms, rate changes, part payments and scenarios go back to how they were when you unlocked set a.'
            : "The sample's terms, rate changes and part payments go back to how they were, and its scenarios are deleted. This can't be undone."}
        </ConfirmDialog>
      )}

      <MyLoanRow {...props} />

      <div className="settings-row is-action">
        <div>
          <div className="font-bold">{setAOpen ? 'Set a is unlocked' : 'Set a'}</div>
          <p className="subtle m-0 mt-1 text-sm">
            {setAOpen
              ? 'Edits here last until you close the tab. Locking goes back to the sample and forgets this device.'
              : 'A private loan that comes encrypted with this site. You can open it with its passphrase.'}
          </p>
        </div>
        <div className="flex justify-end">
          {setAOpen ? (
            <button className="btn" onClick={() => void props.onLock()} type="button">
              <Lock aria-hidden="true" size={16} />
              Lock
            </button>
          ) : (
            <button
              className="btn"
              disabled={!props.vaultAvailable}
              onClick={() => setUnlockingSetA(true)}
              title={props.vaultAvailable ? undefined : 'No data set in this build.'}
              type="button"
            >
              <Unlock aria-hidden="true" size={16} />
              Unlock set a
            </button>
          )}
        </div>
      </div>
      {unlockingSetA && (
        <UnlockDialog onClose={() => setUnlockingSetA(false)} onUnlock={props.onUnlock} />
      )}
    </Card>
  );
}

function MyLoanRow(props: SettingsPageProps) {
  const { datasetId, hasMyLoan } = props;
  const [dialog, setDialog] = useState<'create' | 'paste' | 'remove' | null>(null);
  const [shared, setShared] = useState<{ link: string; copied: boolean } | null>(null);
  const open = datasetId === 'mine';
  const state = myLoanState(open, hasMyLoan);

  const share = async (): Promise<void> => {
    const link = await props.onShareLink();
    let copied = false;
    try {
      await navigator.clipboard.writeText(link);
      copied = true;
    } catch {
      // No clipboard (an old browser or a blocked permission): the field below can be copied.
    }
    setShared({ link, copied });
  };

  return (
    <>
      <div className="settings-row is-action">
        <div>
          <div className="font-bold">{MY_LOAN_TITLE[state]}</div>
          <p className="subtle m-0 mt-1 text-sm">{MY_LOAN_TEXT[state]}</p>
        </div>
        <div className="row-actions">
          {state === 'none' && (
            <>
              <button className="btn" onClick={() => setDialog('create')} type="button">
                <Plus aria-hidden="true" size={16} />
                Start my own loan
              </button>
              <button className="btn" onClick={() => setDialog('paste')} type="button">
                <Link2 aria-hidden="true" size={16} />
                Open a link
              </button>
            </>
          )}
          {state === 'locked' && (
            <button className="btn" onClick={props.onUnlockMine} type="button">
              <Unlock aria-hidden="true" size={16} />
              Unlock your loan
            </button>
          )}
          {state === 'open' && (
            <>
              <button className="btn" onClick={() => void share()} type="button">
                <Link2 aria-hidden="true" size={16} />
                Copy link
              </button>
              <button className="btn" onClick={() => void props.onLock()} type="button">
                <Lock aria-hidden="true" size={16} />
                Lock
              </button>
            </>
          )}
          {state !== 'none' && (
            <button
              className="btn btn-quiet-danger"
              onClick={() => setDialog('remove')}
              type="button"
            >
              <Trash2 aria-hidden="true" size={16} />
              Remove from this device
            </button>
          )}
        </div>
      </div>
      {open && shared !== null && <SharedLink {...shared} />}

      {dialog === 'create' && (
        <CreateLoanDialog
          onClose={() => setDialog(null)}
          onCreate={props.onCreateMyLoan}
          sample={datasetId === 'sample' ? props.profile : undefined}
        />
      )}
      {dialog === 'paste' && (
        <PasteLinkDialog
          onClose={() => setDialog(null)}
          onOpen={(text) => {
            setDialog(null);
            props.onOpenLink(text);
          }}
        />
      )}
      {dialog === 'remove' && (
        <ConfirmDialog
          confirmLabel="Remove"
          title="Remove your loan from this device?"
          onCancel={() => setDialog(null)}
          onConfirm={() => {
            setDialog(null);
            setShared(null);
            void props.onRemoveMyLoan();
          }}
        >
          Your loan is deleted from this device. If you want to keep it, cancel and copy its link
          first. This can't be undone.
        </ConfirmDialog>
      )}
    </>
  );
}

function myLoanState(open: boolean, hasMyLoan: boolean): 'open' | 'locked' | 'none' {
  if (open) {
    return 'open';
  }

  return hasMyLoan ? 'locked' : 'none';
}

const MY_LOAN_TITLE = {
  none: 'Your loan',
  locked: 'Your loan is locked',
  open: 'Your loan is open',
} as const;

const MY_LOAN_TEXT = {
  none: 'Keep your own loan here, encrypted with a passphrase. Or open a link to a loan you saved on another device.',
  locked: "It's saved on this device, encrypted. Its passphrase opens it.",
  open: 'Copy a link to open it on another device. Locking goes back to the sample and forgets this device.',
} as const;

function SharedLink({ link, copied }: { link: string; copied: boolean }) {
  const id = useId();

  return (
    <div className="shared-link" role="status">
      <label className="field-label" htmlFor={id}>
        {copied ? 'Link copied' : 'Copy this link'}
      </label>
      <input
        className="input"
        id={id}
        onFocus={(event) => event.currentTarget.select()}
        readOnly
        value={link}
      />
      <p className="subtle m-0 text-sm">
        The link holds your loan, encrypted, as it is now. Send the passphrase some other way, never
        with the link. Anyone with both can open this copy, even after you change your loan or its
        passphrase.
      </p>
    </div>
  );
}

function PasteLinkDialog({
  onOpen,
  onClose,
}: {
  onOpen: (text: string) => void;
  onClose: () => void;
}) {
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const formRef = useModal<HTMLFormElement>({ onClose, initialFocus: inputRef });

  const submit = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    const found = linkTextFrom(text);

    if (found === undefined || found === '') {
      setError("That isn't a Paydown loan link. It should contain #open=.");
      return;
    }

    onOpen(found);
  };

  return (
    <ModalOverlay>
      <form
        aria-labelledby="paste-title"
        aria-modal="true"
        className="modal"
        method="post"
        onSubmit={submit}
        ref={formRef}
        role="dialog"
      >
        <h2 className="modal-title" id="paste-title">
          Open a link
        </h2>
        <div className="field-row mt-4">
          <label className="label" htmlFor="paste-link">
            Link to a loan
          </label>
          <textarea
            aria-invalid={error !== null}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            className="input link-input"
            id="paste-link"
            onChange={(event) => {
              setText(event.target.value);
              setError(null);
            }}
            ref={inputRef}
            rows={3}
            spellCheck={false}
            value={text}
          />
        </div>
        {error !== null && (
          <p className="mt-3 text-sm font-semibold text-[var(--error)]" role="alert">
            {error}
          </p>
        )}
        <div className="modal-actions">
          <button className="btn" onClick={onClose} type="button">
            Cancel
          </button>
          <button className="btn btn-primary" disabled={text.trim() === ''} type="submit">
            Next
          </button>
        </div>
      </form>
    </ModalOverlay>
  );
}

function ToggleButton({
  pressed,
  onClick,
  children,
}: {
  pressed: boolean;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button aria-pressed={pressed} type="button" onClick={onClick}>
      {children}
    </button>
  );
}

function Term({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function ordinal(day: number): string {
  const tens = day % 100;
  const suffix =
    tens >= 11 && tens <= 13 ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[day % 10] ?? 'th');
  return `${day}${suffix}`;
}
