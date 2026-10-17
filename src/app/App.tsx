import { useEffect, useMemo, useRef, useState, type ReactNode } from 'react';

import { sampleLoan } from '../config/sampleLoan';
import { buildLoanAnalysis } from '../features/loan/loanEngine';
import type { PartPayment, RateChange } from '../features/loan/loanEngine';
import type { LoanProfile } from '../features/vault/loanProfile';
import { openBlob, openBlobWithKey, VaultError } from '../features/vault/vaultCrypto';
import { hasBundledVault, loadBundledVault, type VaultSource } from '../features/vault/vaultSource';
import { ErrorBoundary } from '../components/ErrorBoundary';
import { DashboardPage } from '../pages/DashboardPage';
import { PartPaymentsPage } from '../pages/PartPaymentsPage';
import { RateChangesPage } from '../pages/RateChangesPage';
import { SchedulePage } from '../pages/SchedulePage';
import { SettingsPage } from '../pages/SettingsPage';
import { WhatIfPage } from '../pages/WhatIfPage';
import { createIndexedDbKeyStore, type DeviceKeyStore } from './deviceKeyStore';
import {
  clearLegacyData,
  loadAppearancePrefs,
  loadSampleEdits,
  resetStoredData,
  saveAppearancePrefs,
  saveSampleEdits,
  type AppearancePrefs,
  type UserLoanData,
  type WhatIfScenario,
} from './storage';
import { AppLayout, type PageId } from '../components/Layout';
import { getTodayIso } from '../utils/date';
import { formatInrShort, formatMonthYear } from '../utils/format';
import { pageFromHash } from './navigation';

const defaultPrefs: AppearancePrefs = {
  theme: 'dark',
  palette: 'carbon',
};

/** Non-secret hint that this device holds a remembered key, so boot can skip the sample flash. */
const REMEMBERED_FLAG_KEY = 'paydown:remembered:v1';

export type DatasetId = 'sample' | 'set-a';

type DatasetState =
  | { kind: 'sample' }
  | { kind: 'restoring' }
  | { kind: 'set-a'; original: LoanProfile };

export type AppProps = {
  /** Loads the encrypted data set; injectable for tests. */
  vaultSource?: VaultSource;
  /** Whether this build contains an encrypted data set. */
  vaultAvailable?: boolean;
  /** Where a remembered device key lives; injectable for tests. */
  keyStore?: DeviceKeyStore;
};

let defaultKeyStore: DeviceKeyStore | undefined;

function getDefaultKeyStore(): DeviceKeyStore {
  defaultKeyStore ??= createIndexedDbKeyStore();
  return defaultKeyStore;
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
  keyStore = getDefaultKeyStore(),
}: AppProps = {}) {
  const [page, setPage] = useState<PageId>(() => pageFromHash(window.location.hash));
  const [prefs, setPrefs] = useState<AppearancePrefs>(() => loadAppearancePrefs(defaultPrefs));
  const [sampleData, setSampleData] = useState<UserLoanData>(() => {
    clearLegacyData();
    return loadSampleEdits(userDataFromProfile(sampleLoan));
  });
  const [dataset, setDataset] = useState<DatasetState>(() =>
    vaultAvailable && readRememberedFlag() ? { kind: 'restoring' } : { kind: 'sample' },
  );
  const [unlockedData, setUnlockedData] = useState<UserLoanData | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const restoreStarted = useRef(false);

  const isUnlocked = dataset.kind === 'set-a' && unlockedData !== null;
  const baseProfile = dataset.kind === 'set-a' ? dataset.original : sampleLoan;
  const userData = isUnlocked ? unlockedData : sampleData;
  const setUserData = (update: (data: UserLoanData) => UserLoanData): void => {
    if (isUnlocked) {
      setUnlockedData((data) => (data === null ? data : update(data)));
    } else {
      setSampleData(update);
    }
  };

  const activeProfile = useMemo<LoanProfile>(
    () => ({
      ...baseProfile,
      loan: {
        ...baseProfile.loan,
        rateChanges: userData.rateChanges,
        partPayments: userData.partPayments,
      },
      scenarios: userData.scenarios,
    }),
    [baseProfile, userData],
  );

  const asOfDate = getTodayIso();
  const analysis = useMemo(
    () => buildLoanAnalysis(activeProfile.loan, asOfDate),
    [activeProfile, asOfDate],
  );

  const hasUnsavedUnlockedEdits =
    dataset.kind === 'set-a' &&
    JSON.stringify(userData) !== JSON.stringify(userDataFromProfile(dataset.original));

  const showUnlocked = (profile: LoanProfile): void => {
    setUnlockedData(userDataFromProfile(profile));
    setDataset({ kind: 'set-a', original: profile });
  };

  const unlock = async (passphrase: string, remember: boolean): Promise<void> => {
    const blob = await vaultSource();

    if (blob === undefined) {
      throw new VaultError('bad-blob', 'No data set in this build.');
    }

    const opened = await openBlob(blob, passphrase);

    if (remember) {
      await keyStore.put(opened.dek);
      writeRememberedFlag(true);
    } else {
      await keyStore.clear();
      writeRememberedFlag(false);
    }

    setNotice(null);
    showUnlocked(opened.profile);
  };

  const lock = async (): Promise<void> => {
    await keyStore.clear();
    writeRememberedFlag(false);
    setUnlockedData(null);
    setDataset({ kind: 'sample' });
  };

  const resetData = (): void => {
    if (dataset.kind === 'set-a') {
      setUnlockedData(userDataFromProfile(dataset.original));
      return;
    }

    resetStoredData();
    setSampleData(userDataFromProfile(sampleLoan));
  };

  useEffect(() => {
    if (dataset.kind !== 'restoring' || restoreStarted.current) {
      return;
    }

    restoreStarted.current = true;
    void restoreRememberedDataset(vaultSource, keyStore).then((profile) => {
      if (profile === undefined) {
        writeRememberedFlag(false);
        setNotice('set a is locked again. Unlock it in Settings to see it.');
        setDataset({ kind: 'sample' });
        return;
      }

      setUnlockedData(userDataFromProfile(profile));
      setDataset({ kind: 'set-a', original: profile });
    });
  }, [dataset.kind, keyStore, vaultSource]);

  useEffect(() => {
    document.documentElement.dataset.theme = prefs.theme;
    document.documentElement.dataset.palette = prefs.palette === 'default' ? '' : prefs.palette;
    saveAppearancePrefs(prefs);
  }, [prefs]);

  useEffect(() => {
    saveSampleEdits(sampleData);
  }, [sampleData]);

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

  const loanLabel = activeProfile.meta.name;
  const loanDetail = `${formatInrShort(activeProfile.loan.principal)} · First EMI ${formatMonthYear(
    activeProfile.loan.startDate,
  )}`;

  if (dataset.kind === 'restoring') {
    return (
      <AppLayout activePage={page} onNavigate={navigate} loanLabel="Unlocking…" loanDetail="">
        <div className="content">
          <p className="subtle" role="status">
            Unlocking…
          </p>
        </div>
      </AppLayout>
    );
  }

  const pageElement = getPageElement({
    page,
    navigate,
    prefs,
    setPrefs,
    analysis,
    profile: activeProfile,
    datasetId: isUnlocked ? 'set-a' : 'sample',
    vaultAvailable,
    unlock,
    lock,
    setRateChanges: (rateChanges) => setUserData((data) => ({ ...data, rateChanges })),
    setPartPayments: (partPayments) => setUserData((data) => ({ ...data, partPayments })),
    setScenarios: (scenarios) => setUserData((data) => ({ ...data, scenarios })),
    resetData,
  });

  const banners = (
    <>
      {notice !== null && <Banner onDismiss={() => setNotice(null)}>{notice}</Banner>}
      {hasUnsavedUnlockedEdits && (
        <Banner>
          Edits to set a only last until you close this tab. To keep them, run{' '}
          <code>bun run vault</code>.
        </Banner>
      )}
    </>
  );

  return (
    <AppLayout
      activePage={page}
      onNavigate={navigate}
      loanLabel={loanLabel}
      loanDetail={loanDetail}
      banner={banners}
    >
      <ErrorBoundary resetKeys={[page, userData]} onReset={resetData}>
        {pageElement}
      </ErrorBoundary>
    </AppLayout>
  );
}

function Banner({ children, onDismiss }: { children: ReactNode; onDismiss?: () => void }) {
  return (
    <div className="banner" role="status">
      <span>{children}</span>
      {onDismiss && (
        <button className="btn btn-sm" onClick={onDismiss} type="button">
          Dismiss
        </button>
      )}
    </div>
  );
}

async function restoreRememberedDataset(
  vaultSource: VaultSource,
  keyStore: DeviceKeyStore,
): Promise<LoanProfile | undefined> {
  try {
    const key = await keyStore.get();
    const blob = key === undefined ? undefined : await vaultSource();

    if (key === undefined || blob === undefined) {
      await keyStore.clear();
      return undefined;
    }

    return await openBlobWithKey(blob, key);
  } catch {
    await keyStore.clear().catch(() => undefined);
    return undefined;
  }
}

function userDataFromProfile(profile: LoanProfile): UserLoanData {
  return {
    rateChanges: profile.loan.rateChanges,
    partPayments: profile.loan.partPayments,
    scenarios: profile.scenarios,
  };
}

function readRememberedFlag(): boolean {
  try {
    return window.localStorage.getItem(REMEMBERED_FLAG_KEY) === '1';
  } catch {
    return false;
  }
}

function writeRememberedFlag(remembered: boolean): void {
  try {
    if (remembered) {
      window.localStorage.setItem(REMEMBERED_FLAG_KEY, '1');
    } else {
      window.localStorage.removeItem(REMEMBERED_FLAG_KEY);
    }
  } catch {
    // Storage blocked: the device key still works; boot just shows the sample first.
  }
}

type PageFactoryInput = {
  page: PageId;
  navigate: (page: PageId) => void;
  prefs: AppearancePrefs;
  setPrefs: (prefs: AppearancePrefs) => void;
  analysis: ReturnType<typeof buildLoanAnalysis>;
  profile: LoanProfile;
  datasetId: DatasetId;
  vaultAvailable: boolean;
  unlock: (passphrase: string, remember: boolean) => Promise<void>;
  lock: () => Promise<void>;
  setRateChanges: (rateChanges: RateChange[]) => void;
  setPartPayments: (partPayments: PartPayment[]) => void;
  setScenarios: (scenarios: WhatIfScenario[]) => void;
  resetData: () => void;
};

function getPageElement(input: PageFactoryInput) {
  if (input.page === 'schedule') {
    return <SchedulePage analysis={input.analysis} />;
  }

  if (input.page === 'rates') {
    return (
      <RateChangesPage
        analysis={input.analysis}
        rateChanges={input.profile.loan.rateChanges}
        onChange={input.setRateChanges}
      />
    );
  }

  if (input.page === 'parts') {
    return (
      <PartPaymentsPage
        analysis={input.analysis}
        partPayments={input.profile.loan.partPayments}
        onChange={input.setPartPayments}
      />
    );
  }

  if (input.page === 'whatif') {
    return (
      <WhatIfPage
        analysis={input.analysis}
        baseConfig={input.profile.loan}
        scenarios={input.profile.scenarios}
        onChange={input.setScenarios}
      />
    );
  }

  if (input.page === 'settings') {
    return (
      <SettingsPage
        analysis={input.analysis}
        profile={input.profile}
        datasetId={input.datasetId}
        vaultAvailable={input.vaultAvailable}
        prefs={input.prefs}
        onPrefsChange={input.setPrefs}
        onResetData={input.resetData}
        onUnlock={input.unlock}
        onLock={input.lock}
      />
    );
  }

  return (
    <DashboardPage
      analysis={input.analysis}
      isSample={input.datasetId === 'sample'}
      onNavigate={input.navigate}
    />
  );
}
