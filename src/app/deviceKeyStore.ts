/**
 * Remembers an unlocked data set's key on this device.
 *
 * Stores only a non-extractable AES-GCM `CryptoKey` in IndexedDB: page scripts can use
 * it to decrypt, but cannot read its bytes. No passphrase and no plaintext is stored.
 */
export type DeviceKeyStore = {
  get: () => Promise<CryptoKey | undefined>;
  put: (key: CryptoKey) => Promise<void>;
  clear: () => Promise<void>;
};

const DB_NAME = 'paydown';
const STORE_NAME = 'keys';
const RECORD_ID = 'set-a';

/**
 * Creates the IndexedDB-backed key store. Every call degrades to a no-op when
 * IndexedDB is unavailable (for example private browsing modes that block it).
 *
 * @returns Device key store.
 */
export function createIndexedDbKeyStore(): DeviceKeyStore {
  return {
    get: async () => {
      const db = await openDb();
      if (db === undefined) {
        return undefined;
      }
      const value = await request<unknown>(
        db.transaction(STORE_NAME, 'readonly').objectStore(STORE_NAME).get(RECORD_ID),
      );
      db.close();
      return value instanceof CryptoKey ? value : undefined;
    },
    put: async (key) => {
      const db = await openDb();
      if (db === undefined) {
        return;
      }
      await request(
        db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).put(key, RECORD_ID),
      );
      db.close();
    },
    clear: async () => {
      const db = await openDb();
      if (db === undefined) {
        return;
      }
      await request(
        db.transaction(STORE_NAME, 'readwrite').objectStore(STORE_NAME).delete(RECORD_ID),
      );
      db.close();
    },
  };
}

/**
 * In-memory key store for tests and environments without IndexedDB.
 *
 * @returns Device key store that forgets everything on reload.
 */
export function createMemoryKeyStore(): DeviceKeyStore {
  let stored: CryptoKey | undefined;

  return {
    get: () => Promise.resolve(stored),
    put: (key) => {
      stored = key;
      return Promise.resolve();
    },
    clear: () => {
      stored = undefined;
      return Promise.resolve();
    },
  };
}

async function openDb(): Promise<IDBDatabase | undefined> {
  if (typeof indexedDB === 'undefined') {
    return undefined;
  }

  try {
    const openRequest = indexedDB.open(DB_NAME, 1);
    openRequest.onupgradeneeded = () => {
      openRequest.result.createObjectStore(STORE_NAME);
    };
    return await request(openRequest);
  } catch {
    return undefined;
  }
}

function request<T>(idbRequest: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    idbRequest.onsuccess = () => resolve(idbRequest.result);
    idbRequest.onerror = () => reject(idbRequest.error ?? new Error('IndexedDB request failed'));
  });
}
