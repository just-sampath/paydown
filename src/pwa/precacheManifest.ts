/**
 * Build-time helper for the service worker. It runs in Node from `vite.config.ts`, so it
 * uses no browser or Node APIs.
 */

/** One file the production build writes to `dist/`. */
export type BuiltFile = {
  fileName: string;
  source: string | Uint8Array;
  /** Downloaded only on demand, such as the encrypted set a file, so never precached. */
  lazyOnly?: boolean;
};

/** What the service worker caches on install, and the cache version it uses. */
export type PrecacheManifest = {
  version: string;
  urls: string[];
};

export const SERVICE_WORKER_FILE = 'sw.js';

const FNV_OFFSET = 0x811c9dc5;
const FNV_PRIME = 0x01000193;

function hashInto(hash: number, value: string | Uint8Array): number {
  let next = hash;
  for (let index = 0; index < value.length; index += 1) {
    const unit = typeof value === 'string' ? value.charCodeAt(index) : (value[index] ?? 0);
    next = Math.imul(next ^ unit, FNV_PRIME) >>> 0;
  }
  return next;
}

/**
 * Lists the files the service worker should cache on install and derives a version from
 * their contents. Files without a content hash in their name (`index.html`, icons, the
 * manifest, the worker itself) still change the version when they change, so the new
 * worker starts a fresh cache.
 *
 * @param files - Every file in the build output.
 * @returns URLs relative to the worker, sorted, and an 8 character version.
 */
export function buildPrecacheManifest(files: BuiltFile[]): PrecacheManifest {
  const versioned = files
    .filter((file) => !file.lazyOnly && !file.fileName.endsWith('.map'))
    .sort((a, b) => a.fileName.localeCompare(b.fileName));

  let hash = FNV_OFFSET;
  for (const file of versioned) {
    hash = hashInto(hashInto(hash, file.fileName), file.source);
  }

  return {
    version: hash.toString(16).padStart(8, '0'),
    urls: versioned
      .filter((file) => file.fileName !== SERVICE_WORKER_FILE)
      .map((file) => file.fileName),
  };
}
