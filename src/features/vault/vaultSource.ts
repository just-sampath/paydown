/**
 * Loads the committed encrypted data set lazily, so visitors who never unlock
 * never download it. Returns `undefined` when the build contains no vault file.
 */
export type VaultSource = () => Promise<unknown>;

const vaultModules = import.meta.glob<unknown>('../../vault/set-a.vault.json', {
  import: 'default',
});

export const hasBundledVault = Object.keys(vaultModules).length > 0;

/**
 * Fetches the bundled `set-a` vault blob.
 *
 * @returns Parsed vault JSON, or `undefined` when no vault was built in.
 */
export const loadBundledVault: VaultSource = async () => {
  const load = Object.values(vaultModules)[0];
  return load === undefined ? undefined : load();
};
