import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { SAMPLE_NOTE } from '../config/sampleLoan';
import { buildLoanAnalysis } from '../features/loan/loanEngine';
import type { LoanProfile } from '../features/vault/loanProfile';
import { hasBundledVault, loadBundledVault, type VaultSource } from '../features/vault/vaultSource';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { ConfirmDialog } from '../components/Modal';
import { UnlockDialog } from '../components/UnlockDialog';
import { DashboardPage } from '../pages/DashboardPage';
import { PartPaymentsPage } from '../pages/PartPaymentsPage';
import { RateChangesPage } from '../pages/RateChangesPage';
import { SchedulePage } from '../pages/SchedulePage';
import { SettingsPage } from '../pages/SettingsPage';
import { WhatIfPage } from '../pages/WhatIfPage';
import { createIndexedDbKeyStore, type DeviceKeyStore } from './deviceKeyStore';
import { loadAppearancePrefs, saveAppearancePrefs, type AppearancePrefs } from './storage';
import { useLoanData, type LoanData } from './useLoanData';
import { AppLayout, type PageId } from '../components/Layout';
import { getTodayIso } from '../utils/date';
import { formatInrShort, formatMonthYear } from '../utils/format';
import { pageFromHash } from './navigation';

export type { DatasetId } from './storage';

const defaultPrefs: AppearancePrefs = {
  theme: 'dark',
  palette: 'carbon',
};

export type AppProps = {
  /** Loads the encrypted data set; injectable for tests. */
  vaultSource?: VaultSource;
  /** Whether this build contains an encrypted data set. */
  vaultAvailable?: boolean;
  /** Where set a's remembered key lives; injectable for tests. */
  keyStore?: DeviceKeyStore;
  /** Where your own loan's remembered key lives; injectable for tests. */
  myKeyStore?: DeviceKeyStore;
  /** PBKDF2 iterations for new loans; only tests lower this. */
  iterations?: number;
};

let defaultKeyStores: { setA: DeviceKeyStore; mine: DeviceKeyStore } | undefined;

function getDefaultKeyStores() {
  defaultKeyStores ??= {
    setA: createIndexedDbKeyStore('set-a'),
    mine: createIndexedDbKeyStore('mine'),
  };
  return defaultKeyStores;
}

/**
 * Renders the loan tracker application shell and page state.
 *
 * @param props - Optional injected vault dependencies.
 * @returns React application element.
 */
export function App({
  vaultSource = loadBundledVault,
  vaultAvailable = hasBundledVault,
  keyStore = getDefaultKeyStores().setA,
  myKeyStore = getDefaultKeyStores().mine,
  iterations,
}: AppProps = {}) {
  const [page, setPage] = useState<PageId>(() => pageFromHash(window.location.hash));
  const [prefs, setPrefs] = useState<AppearancePrefs>(() => loadAppearancePrefs(defaultPrefs));
  const [unlockingMine, setUnlockingMine] = useState(false);
  const data = useLoanData({ vaultSource, vaultAvailable, keyStore, myKeyStore, iterations });
  const { dataset, profile } = data;

  const asOfDate = getTodayIso();
  const analysis = useMemo(() => buildLoanAnalysis(profile.loan, asOfDate), [profile, asOfDate]);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.dataset.palette = prefs.palette === 'default' ? '' : prefs.palette;
    saveAppearancePrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    const syncPageFromHash = (): void => setPage(pageFromHash(window.location.hash));
    window.addEventListener('hashchange', syncPageFromHash);
    return () => window.removeEventListener('hashchange', syncPageFromHash);
  }, []);

  // A new page starts at the top, not at the previous page's scroll position.
  const shownPage = useRef(page);
  useEffect(() => {
    if (shownPage.current !== page) {
      shownPage.current = page;
      window.scrollTo({ top: 0 });
    }
  }, [page]);

  const navigate = (nextPage: PageId): void => {
    setPage(nextPage);
    if (window.location.hash !== `#${nextPage}`) {
      window.location.assign(`#${nextPage}`);
    }
  };

  const dialogs = (
    <>
      {unlockingMine && (
        <UnlockDialog
          description="Your loan is saved on this device, encrypted. Its passphrase opens it."
          onClose={() => setUnlockingMine(false)}
          onUnlock={data.unlockMine}
          title="Unlock your loan"
          wrongPassphrase="That passphrase didn't unlock your loan."
        />
      )}
      <LinkDialogs data={data} />
    </>
  );

  if (dataset === 'restoring') {
    return (
      <AppLayout activePage={page} onNavigate={navigate} loanLabel="Unlocking…" loanDetail="">
        <div className="content">
          <p className="subtle" role="status">
            Unlocking…
          </p>
        </div>
        {dialogs}
      </AppLayout>
    );
  }

  const loanDetail = `${formatInrShort(profile.loan.principal)} · First EMI ${formatMonthYear(
    profile.loan.startDate,
  )}`;

  return (
    <AppLayout
      activePage={page}
      onNavigate={navigate}
      loanLabel={profile.meta.name}
      loanDetail={loanDetail}
      // The dashboard hero already says it.
      sampleNote={dataset !== 'sample' || page === 'dashboard' ? undefined : SAMPLE_NOTE}
      banner={<Banners data={data} onUnlockMine={() => setUnlockingMine(true)} />}
    >
      <ErrorBoundary resetKeys={[page, profile]} onReset={data.resetData}>
        {getPageElement({
          page,
          navigate,
          prefs,
          setPrefs,
          analysis,
          data,
          vaultAvailable,
          onUnlockMine: () => setUnlockingMine(true),
        })}
      </ErrorBoundary>
      {dialogs}
    </AppLayout>
  );
}

function Banners({ data, onUnlockMine }: { data: LoanData; onUnlockMine: () => void }) {
  return (
    <>
      {data.notice === 'set-a-locked' && (
        <Banner onDismiss={data.dismissNotice}>
          Set a is locked again. Unlock it in Settings to see it.
        </Banner>
      )}
      {data.notice === 'mine-locked' && data.dataset !== 'mine' && (
        <Banner action={{ label: 'Unlock', onClick: onUnlockMine }} onDismiss={data.dismissNotice}>
          Your loan is on this device and locked.
        </Banner>
      )}
      {data.saveError !== null && <Banner>{data.saveError}</Banner>}
      {data.hasUnsavedSetAEdits && (
        <Banner>
          Edits to set a only last until you close this tab. To keep them, run{' '}
          <code>bun run vault</code>.
        </Banner>
      )}
    </>
  );
}

/**
 * Opening a link replaces your loan on this device, so that is confirmed first. Then the
 * link's passphrase is asked for. Cancelling either step drops the link.
 */
function LinkDialogs({ data }: { data: LoanData }) {
  const [replaceConfirmed, setReplaceConfirmed] = useState(false);
  const link = data.pendingLink;

  if (link === null) {
    return null;
  }

  const close = (): void => {
    setReplaceConfirmed(false);
    data.setPendingLink(null);
  };

  if (data.hasMyLoan && !replaceConfirmed) {
    return (
      <ConfirmDialog
        confirmLabel="Replace"
        onCancel={close}
        onConfirm={() => setReplaceConfirmed(true)}
        title="Replace the loan on this device?"
      >
        This link holds a loan. Opening it replaces the loan saved on this device. To keep that one,
        cancel and copy its link first.
      </ConfirmDialog>
    );
  }

  return (
    <UnlockDialog
      description="This link holds an encrypted loan. Enter its passphrase to open it and save it on this device."
      onClose={close}
      onUnlock={async (passphrase, remember) => {
        await data.openLink(link, passphrase, remember);
        setReplaceConfirmed(false);
      }}
      submitLabel="Open"
      title="Open a shared loan"
      wrongPassphrase="That passphrase didn't open this loan."
    />
  );
}

function Banner({
  children,
  action,
  onDismiss,
}: {
  children: ReactNode;
  action?: { label: string; onClick: () => void };
  onDismiss?: () => void;
}) {
  return (
    <div className="banner" role="status">
      <span>{children}</span>
      {(action !== undefined || onDismiss !== undefined) && (
        <span className="banner-actions">
          {action && (
            <button className="btn btn-sm" onClick={action.onClick} type="button">
              {action.label}
            </button>
          )}
          {onDismiss && (
            <button className="btn btn-sm" onClick={onDismiss} type="button">
              Dismiss
            </button>
          )}
        </span>
      )}
    </div>
  );
}

type PageFactoryInput = {
  page: PageId;
  navigate: (page: PageId) => void;
  prefs: AppearancePrefs;
  setPrefs: (prefs: AppearancePrefs) => void;
  analysis: ReturnType<typeof buildLoanAnalysis>;
  data: LoanData;
  vaultAvailable: boolean;
  onUnlockMine: () => void;
};

function getPageElement(input: PageFactoryInput) {
  const { data } = input;
  const profile = data.profile;
  const setLoan = (change: Partial<LoanProfile['loan']>): void =>
    data.update((current) => ({ ...current, loan: { ...current.loan, ...change } }));

  if (input.page === 'schedule') {
    return <SchedulePage analysis={input.analysis} />;
  }

  if (input.page === 'rates') {
    return (
      <RateChangesPage
        analysis={input.analysis}
        rateChanges={profile.loan.rateChanges}
        onChange={(rateChanges) => setLoan({ rateChanges })}
      />
    );
  }

  if (input.page === 'parts') {
    return (
      <PartPaymentsPage
        analysis={input.analysis}
        partPayments={profile.loan.partPayments}
        onChange={(partPayments) => setLoan({ partPayments })}
      />
    );
  }

  if (input.page === 'whatif') {
    return (
      <WhatIfPage
        analysis={input.analysis}
        baseConfig={profile.loan}
        scenarios={profile.scenarios}
        onChange={(scenarios) => data.update((current) => ({ ...current, scenarios }))}
      />
    );
  }

  if (input.page === 'settings') {
    return (
      <SettingsPage
        analysis={input.analysis}
        profile={profile}
        datasetId={data.dataset === 'restoring' ? 'sample' : data.dataset}
        vaultAvailable={input.vaultAvailable}
        hasMyLoan={data.hasMyLoan}
        prefs={input.prefs}
        onPrefsChange={input.setPrefs}
        onProfileChange={(next) => data.update(() => next)}
        onResetData={data.resetData}
        onUnlock={data.unlockSetA}
        onLock={data.lock}
        onUnlockMine={input.onUnlockMine}
        onCreateMyLoan={data.createMyLoan}
        onOpenLink={(text) => data.setPendingLink(text)}
        onShareLink={data.shareLink}
        onRemoveMyLoan={data.removeMyLoan}
      />
    );
  }

  return (
    <DashboardPage
      analysis={input.analysis}
      isSample={data.dataset === 'sample'}
      onNavigate={input.navigate}
    />
  );
}
