import { describe, expect, test } from 'vitest';

import { buildPrecacheManifest } from '../../src/pwa/precacheManifest';

describe('buildPrecacheManifest', () => {
  test('lists built files in order, leaving out the worker, source maps and lazy-only files', () => {
    const manifest = buildPrecacheManifest([
      { fileName: 'sw.js', source: 'worker' },
      { fileName: 'index.html', source: '<html>' },
      { fileName: 'assets/index-abc.js', source: 'app' },
      { fileName: 'assets/index-abc.js.map', source: '{}' },
      { fileName: 'assets/set-a.vault-xyz.js', source: 'ciphertext', lazyOnly: true },
      { fileName: 'icon-192.png', source: new Uint8Array([1, 2, 3]) },
    ]);

    expect(manifest.urls).toEqual(['assets/index-abc.js', 'icon-192.png', 'index.html']);
    expect(manifest.version).toMatch(/^[0-9a-f]{8}$/);
  });

  test('changes the version when a file without a hashed name changes', () => {
    const before = buildPrecacheManifest([
      { fileName: 'index.html', source: '<html>' },
      { fileName: 'icon-192.png', source: new Uint8Array([1, 2, 3]) },
    ]);
    const sameAgain = buildPrecacheManifest([
      { fileName: 'icon-192.png', source: new Uint8Array([1, 2, 3]) },
      { fileName: 'index.html', source: '<html>' },
    ]);
    const newIcon = buildPrecacheManifest([
      { fileName: 'index.html', source: '<html>' },
      { fileName: 'icon-192.png', source: new Uint8Array([1, 2, 4]) },
    ]);

    expect(sameAgain.version).toBe(before.version);
    expect(newIcon.version).not.toBe(before.version);
  });

  test('changes the version when only the worker changes', () => {
    const shell = { fileName: 'index.html', source: '<html>' };
    const before = buildPrecacheManifest([shell, { fileName: 'sw.js', source: 'one' }]);
    const after = buildPrecacheManifest([shell, { fileName: 'sw.js', source: 'two' }]);

    expect(after.urls).toEqual(before.urls);
    expect(after.version).not.toBe(before.version);
  });

  test('ignores lazy-only files when picking the version', () => {
    const shell = { fileName: 'index.html', source: '<html>' };
    const without = buildPrecacheManifest([shell]);
    const withVault = buildPrecacheManifest([
      shell,
      { fileName: 'assets/set-a.vault-xyz.js', source: 'ciphertext', lazyOnly: true },
    ]);

    expect(withVault.version).toBe(without.version);
  });
});
