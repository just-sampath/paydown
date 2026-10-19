import { Lock, Moon, RotateCcw, Sun, Unlock } from 'lucide-react';
import { useState, type ReactNode } from 'react';

import type { DatasetId } from '../app/App';
import type { AppearancePrefs } from '../app/storage';
import { ConfirmDialog } from '../components/Modal';
import { Card } from '../components/Primitives';
import { UnlockDialog } from '../components/UnlockDialog';
import type { LoanAnalysis } from '../features/loan/loanEngine';
import type { LoanProfile } from '../features/vault/loanProfile';
import { formatDate, formatDuration, formatInr, formatPercent, pluralize } from '../utils/format';

type SettingsPageProps = {
  analysis: LoanAnalysis;
  profile: LoanProfile;
  datasetId: DatasetId;
  vaultAvailable: boolean;
  prefs: AppearancePrefs;
  onPrefsChange: (prefs: AppearancePrefs) => void;
  onResetData: () => void;
  onUnlock: (passphrase: string, remember: boolean) => Promise<void>;
  onLock: () => Promise<void>;
};

const PALETTES: Array<{ id: AppearancePrefs['palette']; name: string; colors: string[] }> = [
  { id: 'carbon', name: 'Carbon', colors: ['#0b0a07', '#ffe15a', '#b8a3f0'] },
  { id: 'default', name: 'Navy', colors: ['#003d5b', '#25e2cc', '#f06000'] },
  { id: 'cocoa', name: 'Cocoa', colors: ['#5b2c20', '#e8946a', '#f2c879'] },
];

/**
 * Renders appearance controls, the loan's fixed terms, and data controls.
 *
 * @param props - Settings props.
 * @param props.analysis - Loan analysis containing derived values.
 * @param props.profile - Active loan profile whose base terms are shown.
 * @param props.datasetId - Which data set is active.
 * @param props.vaultAvailable - Whether this build contains an encrypted data set.
 * @param props.prefs - Current appearance preferences.
 * @param props.onPrefsChange - Callback for theme and palette changes.
 * @param props.onResetData - Callback that clears persisted data.
 * @param props.onUnlock - Attempts to unlock the encrypted data set.
 * @param props.onLock - Locks the data set and forgets this device.
 * @returns Settings page element.
 */
export function SettingsPage({
  analysis,
  profile,
  datasetId,
  vaultAvailable,
  prefs,
  onPrefsChange,
  onResetData,
  onUnlock,
  onLock,
}: SettingsPageProps) {
  const { meta, loan } = profile;
  const [dialogOpen, setDialogOpen] = useState(false);
  const [confirmingReset, setConfirmingReset] = useState(false);
  const unlocked = datasetId === 'set-a';

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
        subtitle="These come with the loan data and can't be changed here. Rate changes and part payments have their own pages."
      >
        <dl className="terms-grid">
          <Term label="Amount borrowed" value={formatInr(loan.principal)} />
          <Term label="Starting rate" value={`${formatPercent(loan.originalRate)}, floating`} />
          <Term
            label="Original term"
            value={`${formatDuration(loan.tenureMonths)} (${pluralize(loan.tenureMonths, 'EMI')})`}
          />
          <Term label="First EMI" value={formatDate(loan.startDate)} />
          <Term label="EMI" value={formatInr(analysis.actual.summary.baseEmi)} />
          <Term
            label="EMI due on"
            value={`The ${ordinal(Number(loan.startDate.slice(8, 10)))} of each month`}
          />
          <Term label="Last EMI" value={formatInr(analysis.actual.rows.at(-1)?.emi ?? 0)} />
          <Term
            label="Pre-EMI interest"
            value={formatInr(analysis.actual.summary.preEmiInterest)}
          />
          <Term label="When the rate changes" value="EMI stays, term moves" />
          <Term
            label="Part-payment interest"
            value={formatInr(analysis.actual.summary.totalSimpleInterest)}
          />
        </dl>
      </Card>

      <Card eyebrow="Data" title="Data on this device">
        <div className="settings-row is-action">
          <div>
            <div className="font-bold">Restore default data</div>
            <p className="subtle m-0 mt-1 text-sm">
              {unlocked
                ? 'Drops the edits you made since set a was unlocked.'
                : 'Puts back the sample rate changes and part payments and deletes your scenarios. Your theme stays as it is.'}
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
        {confirmingReset && (
          <ConfirmDialog
            confirmLabel={unlocked ? 'Drop edits' : 'Restore default data'}
            title={unlocked ? 'Drop your edits to set a?' : 'Restore the default data?'}
            onCancel={() => setConfirmingReset(false)}
            onConfirm={() => {
              setConfirmingReset(false);
              onResetData();
            }}
          >
            {unlocked
              ? 'Rate changes, part payments and scenarios go back to how they were when you unlocked set a.'
              : "Your rate changes and part payments go back to the sample ones, and your scenarios are deleted. This can't be undone."}
          </ConfirmDialog>
        )}
        <div className="settings-row is-action">
          <div>
            <div className="font-bold">{unlocked ? 'Set a is unlocked' : 'Sample loan'}</div>
            <p className="subtle m-0 mt-1 text-sm">
              {unlocked
                ? 'Edits here last until you close the tab. Locking goes back to the sample and forgets this device.'
                : 'All figures shown are made up. Set a is a private loan you can open with its passphrase.'}
            </p>
          </div>
          <div className="flex justify-end">
            {unlocked ? (
              <button className="btn" onClick={() => void onLock()} type="button">
                <Lock aria-hidden="true" size={16} />
                Lock
              </button>
            ) : (
              <button
                className="btn"
                disabled={!vaultAvailable}
                onClick={() => setDialogOpen(true)}
                title={vaultAvailable ? undefined : 'No data set in this build.'}
                type="button"
              >
                <Unlock aria-hidden="true" size={16} />
                Unlock set a
              </button>
            )}
          </div>
        </div>
        {dialogOpen && <UnlockDialog onClose={() => setDialogOpen(false)} onUnlock={onUnlock} />}
      </Card>
    </div>
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
