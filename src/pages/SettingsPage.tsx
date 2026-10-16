import { Lock, RotateCcw, Unlock } from 'lucide-react';
import { useState } from 'react';

import { Card } from '../components/Primitives';
import { UnlockDialog } from '../components/UnlockDialog';
import type { DatasetId } from '../app/App';
import type { AppearancePrefs } from '../app/storage';
import type { LoanAnalysis } from '../features/loan/loanEngine';
import type { LoanProfile } from '../features/vault/loanProfile';
import {
  formatDate,
  formatDuration,
  formatInr,
  formatInrShort,
  formatPercent,
} from '../utils/format';

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

/**
 * Renders loan settings, theme controls, and reset controls.
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

  return (
    <div className="content">
      <div className="grid gap-6 xl:grid-cols-[1fr_320px]">
        <Card
          eyebrow="Loan details"
          title={meta.name}
          subtitle="Originating loan parameters. Events are edited on their own pages."
        >
          <Field label="Loan name" value={meta.name} />
          <Field label="Lender" value={meta.lender} />
          <Field label="Principal" value={formatInr(loan.principal)} />
          <Field label="Starting rate" value={formatPercent(loan.originalRate)} />
          <Field label="Tenure" value={formatDuration(loan.tenureMonths)} />
          <Field label="Start date" value={formatDate(loan.startDate)} />
          <Field label="EMI day" value="1st of each month" />
          <Field label="Rate type" value="Floating" />
          <Field label="Strategy on change" value="Reduce tenure (keep EMI)" />
        </Card>

        <Card eyebrow="Computed" title="Derived values">
          <div className="grid gap-4">
            <Metric label="Base EMI" value={formatInr(analysis.actual.summary.baseEmi)} />
            <Metric
              label="Final payment"
              value={formatInr(analysis.actual.rows.at(-1)?.emi ?? 0)}
            />
            <Metric
              label="Original total interest"
              value={formatInr(analysis.original.summary.totalInterest)}
            />
            <Metric
              label="Actual total interest"
              value={formatInr(analysis.actual.summary.totalInterest)}
              accent
            />
            <Metric
              label="Total outflow"
              value={formatInrShort(analysis.actual.summary.totalOutflow)}
            />
            <Metric
              label="Prepayment simple interest"
              value={formatInr(analysis.actual.summary.totalSimpleInterest)}
            />
            <Metric
              label="Pre-EMI interest"
              value={formatInr(analysis.actual.summary.preEmiInterest)}
            />
          </div>
        </Card>
      </div>

      <div className="section-grid">
        <Card eyebrow="Appearance" title="Theme and palette">
          <div className="field-row">
            <label className="label" htmlFor="theme">
              Theme
            </label>
            <select
              className="select"
              id="theme"
              value={prefs.theme}
              onChange={(event) =>
                onPrefsChange({ ...prefs, theme: event.target.value as AppearancePrefs['theme'] })
              }
            >
              <option value="dark">Dark</option>
              <option value="light">Light</option>
            </select>
          </div>
          <div className="field-row">
            <label className="label" htmlFor="palette">
              Palette
            </label>
            <select
              className="select"
              id="palette"
              value={prefs.palette}
              onChange={(event) =>
                onPrefsChange({
                  ...prefs,
                  palette: event.target.value as AppearancePrefs['palette'],
                })
              }
            >
              <option value="carbon">Carbon · Citron</option>
              <option value="default">Navy · Teal</option>
              <option value="cocoa">Cocoa · Apricot</option>
            </select>
          </div>
        </Card>

        <Card
          eyebrow="Data sets"
          title={datasetId === 'set-a' ? 'set a · unlocked' : 'Sample loan'}
          subtitle={
            datasetId === 'set-a'
              ? 'Edits here are temporary. Lock to return to the sample and forget this device.'
              : 'Figures shown are fictional.'
          }
        >
          {datasetId === 'set-a' ? (
            <button className="btn w-full" onClick={() => void onLock()} type="button">
              <Lock size={16} />
              lock
            </button>
          ) : (
            <button
              className="btn w-full"
              disabled={!vaultAvailable}
              onClick={() => setDialogOpen(true)}
              title={vaultAvailable ? undefined : 'No data set in this build.'}
              type="button"
            >
              <Unlock size={16} />
              unlock set a
            </button>
          )}
          {dialogOpen && <UnlockDialog onClose={() => setDialogOpen(false)} onUnlock={onUnlock} />}
        </Card>

        <Card
          eyebrow="Data"
          title="Restore default data"
          subtitle={
            datasetId === 'set-a'
              ? 'Discards edits made since set a was unlocked.'
              : "Replaces local edits, scenarios, and appearance preferences with this dashboard's defaults."
          }
        >
          <button
            className="btn btn-danger w-full"
            onClick={() => {
              if (
                window.confirm(
                  'Restore the default loan data? This replaces your local edits and scenarios.',
                )
              ) {
                onResetData();
              }
            }}
          >
            <RotateCcw size={16} />
            Restore default data
          </button>
        </Card>
      </div>
    </div>
  );
}

function Field({ label, value }: { label: string; value: string }) {
  return (
    <div className="field-row">
      <div className="label">{label}</div>
      <input className="input" value={value} readOnly />
    </div>
  );
}

function Metric({
  label,
  value,
  accent = false,
}: {
  label: string;
  value: string;
  accent?: boolean;
}) {
  return (
    <div>
      <div className="label">{label}</div>
      <div className={`mt-1 font-extrabold ${accent ? 'text-[var(--jade)]' : ''}`}>{value}</div>
    </div>
  );
}
