import { useEffect, useRef, useState } from 'react';

import { sampleLoan } from '../config/sampleLoan';
import type { LoanProfile } from '../features/vault/loanProfile';
import {
  openBlob,
  openBlobWithKey,
  resealData,
  sealProfile,
  VaultError,
  type VaultBlob,
} from '../features/vault/vaultCrypto';
import { decodeVaultLink, linkFromBlob, linkTextFrom } from '../features/vault/vaultLink';
import type { VaultSource } from '../features/vault/vaultSource';
import type { DeviceKeyStore } from './deviceKeyStore';
import {
  clearLegacyData,
  clearMyLoanBlob,
  loadActiveDataset,
  loadMyLoanBlob,
  loadSample,
  resetStoredData,
  saveActiveDataset,
  saveMyLoanBlob,
  saveSample,
  type DatasetId,
} from './storage';

type OpenLoan = { profile: LoanProfile; blob: VaultBlob; dek: CryptoKey };
type SetA = { original: LoanProfile; current: LoanProfile };

export type LoanDataOptions = {
  vaultSource: VaultSource;
  vaultAvailable: boolean;
  /** Remembered key for set a. */
  keyStore: DeviceKeyStore;
  /** Remembered key for the visitor's own loan. */
  myKeyStore: DeviceKeyStore;
  /** PBKDF2 iterations for new loans; only tests lower this. */
  iterations?: number;
};

export type NoticeKind = 'mine-locked' | 'set-a-locked';

/**
 * Owns the three loans the app can show: the sample (plain, in localStorage), set a (bundled,
 * encrypted, edits in memory), and the visitor's own loan (encrypted on the device, saved on
 * every edit). Exactly one is showing at a time; opening one locks the other encrypted one.
 *
 * @param options - Vault source, key stores and test settings.
 * @returns The active profile, editing callbacks and lock state.
 */
export function useLoanData(options: LoanDataOptions) {
  const { vaultSource, vaultAvailable, keyStore, myKeyStore, iterations } = options;
  const [sample, setSample] = useState<LoanProfile>(() => {
    clearLegacyData();
    return loadSample();
  });
  const [active, setActive] = useState<DatasetId | 'restoring'>(() =>
    initialDataset(vaultAvailable),
  );
  const [setA, setSetA] = useState<SetA | null>(null);
  const [mine, setMine] = useState<OpenLoan | null>(null);
  const [hasMyLoan, setHasMyLoan] = useState(() => loadMyLoanBlob() !== undefined);
  const [notice, setNotice] = useState<NoticeKind | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [pendingLink, setPendingLink] = useState<string | null>(
    () => linkTextFrom(window.location.hash) ?? null,
  );
  const restoreStarted = useRef(false);
  const saved = useRef<{ profile: LoanProfile; blob: VaultBlob } | null>(null);
  const saveChain = useRef<Promise<void>>(Promise.resolve());

  const dataset: DatasetId | 'restoring' =
    (active === 'set-a' && setA === null) || (active === 'mine' && mine === null)
      ? 'sample'
      : active;
  const profile = pickProfile(dataset, sample, setA, mine);

  const update = (change: (profile: LoanProfile) => LoanProfile): void => {
    if (dataset === 'set-a') {
      setSetA((value) => (value === null ? value : { ...value, current: change(value.current) }));
    } else if (dataset === 'mine') {
      setMine((value) => (value === null ? value : { ...value, profile: change(value.profile) }));
    } else {
      setSample(change);
    }
  };

  const showSetA = (opened: LoanProfile): void => {
    setMine(null);
    setSetA({ original: opened, current: opened });
    setActive('set-a');
    saveActiveDataset('set-a');
  };

  const showMine = (opened: OpenLoan): void => {
    saved.current = { profile: opened.profile, blob: opened.blob };
    setSetA(null);
    setMine(opened);
    setHasMyLoan(true);
    setActive('mine');
    saveActiveDataset('mine');
  };

  const rememberOnly = async (store: DeviceKeyStore, key: CryptoKey, remember: boolean) => {
    // One loan is open at a time, so only that loan may have a remembered key.
    await Promise.all([keyStore.clear(), myKeyStore.clear()]);
    if (remember) {
      await store.put(key);
    }
  };

  const unlockSetA = async (passphrase: string, remember: boolean): Promise<void> => {
    const blob = await vaultSource();

    if (blob === undefined) {
      throw new VaultError('bad-blob', 'No data set in this build.');
    }

    const opened = await openBlob(blob, passphrase);
    await rememberOnly(keyStore, opened.dek, remember);
    setNotice(null);
    showSetA(opened.profile);
  };

  const unlockMine = async (passphrase: string, remember: boolean): Promise<void> => {
    const blob = loadMyLoanBlob();

    if (blob === undefined) {
      setHasMyLoan(false);
      throw new VaultError('bad-blob', 'There is no loan on this device any more.');
    }

    const opened = await openBlob(blob, passphrase, { writable: true });
    await rememberOnly(myKeyStore, opened.dek, remember);
    setNotice(null);
    showMine({ profile: opened.profile, blob, dek: opened.dek });
  };

  const createMyLoan = async (
    newProfile: LoanProfile,
    passphrase: string,
    remember: boolean,
    fromSample: boolean,
  ): Promise<void> => {
    const sealed = await sealProfile(newProfile, passphrase, {
      version: 2,
      ...(iterations === undefined ? {} : { iterations, minIterations: iterations }),
    });
    // Opening it again checks the round trip and gives a key that can't be exported.
    const opened = await openBlob(sealed, passphrase, {
      writable: true,
      ...(iterations === undefined ? {} : { minIterations: iterations }),
    });
    saveMyLoanBlob(sealed);
    await rememberOnly(myKeyStore, opened.dek, remember);

    if (fromSample) {
      // The sample may hold real figures typed in plain text; they now live encrypted.
      resetStoredData();
      setSample(sampleLoan);
    }

    setNotice(null);
    showMine({ profile: opened.profile, blob: sealed, dek: opened.dek });
  };

  const openLink = async (text: string, passphrase: string, remember: boolean): Promise<void> => {
    const minIterations = iterations === undefined ? {} : { minIterations: iterations };
    const blob = decodeVaultLink(text, minIterations.minIterations);
    const opened = await openBlob(blob, passphrase, { writable: true, ...minIterations });
    saveMyLoanBlob(blob);
    await rememberOnly(myKeyStore, opened.dek, remember);
    setNotice(null);
    setPendingLink(null);
    showMine({ profile: opened.profile, blob, dek: opened.dek });
  };

  const lock = async (): Promise<void> => {
    await saveChain.current;
    await Promise.all([keyStore.clear(), myKeyStore.clear()]);
    setSetA(null);
    setMine(null);
    setActive('sample');
    saveActiveDataset('sample');
  };

  const removeMyLoan = async (): Promise<void> => {
    await saveChain.current;
    await myKeyStore.clear();
    clearMyLoanBlob();
    saved.current = null;
    setHasMyLoan(false);
    setSaveError(null);
    setMine(null);
    if (dataset !== 'set-a') {
      setActive('sample');
      saveActiveDataset('sample');
    }
  };

  const resetData = (): void => {
    if (dataset === 'set-a') {
      setSetA((value) => (value === null ? value : { ...value, current: value.original }));
    } else if (dataset === 'sample') {
      resetStoredData();
      setSample(sampleLoan);
    }
  };

  const shareLink = async (): Promise<string> => {
    await saveChain.current;
    const blob = saved.current?.blob ?? loadMyLoanBlob();

    if (blob === undefined) {
      throw new VaultError('bad-blob', 'There is no loan on this device to share.');
    }

    return linkFromBlob(blob, window.location);
  };

  // Every edit to your own loan is encrypted and stored at once. The chain keeps saves in order.
  useEffect(() => {
    if (mine === null || saved.current === null || saved.current.profile === mine.profile) {
      return;
    }

    const { profile: next, dek } = mine;
    saveChain.current = saveChain.current.then(async () => {
      const previous = saved.current;
      if (previous === null) {
        return;
      }
      try {
        const blob = await resealData(next, previous.blob, dek);
        saveMyLoanBlob(blob);
        saved.current = { profile: next, blob };
        setSaveError(null);
      } catch (error) {
        setSaveError(saveErrorMessage(error));
      }
    });
  }, [mine]);

  useEffect(() => {
    saveSample(sample);
  }, [sample]);

  useEffect(() => {
    if (active !== 'restoring' || restoreStarted.current) {
      return;
    }

    restoreStarted.current = true;

    if (loadActiveDataset() === 'mine') {
      void restoreMine(myKeyStore).then((opened) => {
        if (opened === undefined) {
          // The hint stays, so every visit says the loan is here until it's unlocked or removed.
          setNotice('mine-locked');
          setActive('sample');
          return;
        }
        saved.current = { profile: opened.profile, blob: opened.blob };
        setMine(opened);
        setActive('mine');
      });
      return;
    }

    void restoreSetA(vaultSource, keyStore).then((opened) => {
      if (opened === undefined) {
        saveActiveDataset('sample');
        setNotice('set-a-locked');
        setActive('sample');
        return;
      }
      setSetA({ original: opened, current: opened });
      setActive('set-a');
    });
  }, [active, keyStore, myKeyStore, vaultSource]);

  useEffect(() => {
    dropLinkFromAddressBar();

    const onHashChange = (): void => {
      const text = dropLinkFromAddressBar();
      if (text !== undefined) {
        setPendingLink(text);
      }
    };

    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  return {
    dataset,
    profile,
    hasMyLoan,
    notice,
    dismissNotice: () => setNotice(null),
    saveError,
    pendingLink,
    setPendingLink,
    hasUnsavedSetAEdits:
      dataset === 'set-a' &&
      setA !== null &&
      JSON.stringify(setA.current) !== JSON.stringify(setA.original),
    update,
    resetData,
    unlockSetA,
    unlockMine,
    createMyLoan,
    openLink,
    lock,
    removeMyLoan,
    shareLink,
  };
}

export type LoanData = ReturnType<typeof useLoanData>;

/**
 * Removes a `#open=` link from the address bar at once, so it isn't copied or shared again
 * by accident.
 *
 * @returns The link's encoded text, or `undefined` when the hash holds no link.
 */
function dropLinkFromAddressBar(): string | undefined {
  const text = linkTextFrom(window.location.hash);

  if (text !== undefined) {
    window.history.replaceState(
      null,
      '',
      `${window.location.pathname}${window.location.search}#dashboard`,
    );
  }

  return text;
}

function pickProfile(
  dataset: DatasetId | 'restoring',
  sample: LoanProfile,
  setA: SetA | null,
  mine: OpenLoan | null,
): LoanProfile {
  if (dataset === 'set-a' && setA !== null) {
    return setA.current;
  }

  if (dataset === 'mine' && mine !== null) {
    return mine.profile;
  }

  return sample;
}

function initialDataset(vaultAvailable: boolean): DatasetId | 'restoring' {
  const wanted = loadActiveDataset();

  if (wanted === 'mine' && loadMyLoanBlob() !== undefined) {
    return 'restoring';
  }

  if (wanted === 'set-a' && vaultAvailable) {
    return 'restoring';
  }

  return 'sample';
}

async function restoreSetA(
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

async function restoreMine(myKeyStore: DeviceKeyStore): Promise<OpenLoan | undefined> {
  try {
    const key = await myKeyStore.get();
    const blob = loadMyLoanBlob();

    if (key === undefined || blob === undefined || !key.usages.includes('encrypt')) {
      await myKeyStore.clear();
      return undefined;
    }

    return { profile: await openBlobWithKey(blob, key), blob, dek: key };
  } catch {
    await myKeyStore.clear().catch(() => undefined);
    return undefined;
  }
}

function saveErrorMessage(error: unknown): string {
  if (error instanceof VaultError && error.code === 'too-large') {
    return 'Your loan has too many events to save. Remove some, or your latest edits are lost when you close this tab.';
  }

  return "Your latest edits couldn't be saved on this device. They are lost when you close this tab.";
}
