import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import type { Plugin } from 'vite';
import { defineConfig } from 'vitest/config';

import type { BuiltFile } from './src/pwa/precacheManifest';
import { buildPrecacheManifest, SERVICE_WORKER_FILE } from './src/pwa/precacheManifest';

const contentSecurityPolicy = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  "connect-src 'self'",
  "object-src 'none'",
  "base-uri 'none'",
  "form-action 'none'",
].join('; ');

/**
 * Adds a Content Security Policy to production builds only, so the dev server's
 * inline HMR scripts keep working.
 */
function contentSecurityPolicyPlugin(): Plugin {
  return {
    name: 'paydown-csp',
    apply: 'build',
    transformIndexHtml: () => [
      {
        tag: 'meta',
        attrs: { 'http-equiv': 'Content-Security-Policy', content: contentSecurityPolicy },
        injectTo: 'head-prepend',
      },
    ],
  };
}

function publicFiles(dir: string, prefix = ''): BuiltFile[] {
  return readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    const fileName = `${prefix}${name}`;
    return statSync(path).isDirectory()
      ? publicFiles(path, `${fileName}/`)
      : [{ fileName, source: readFileSync(path) }];
  });
}

/**
 * Builds `src/pwa/worker.ts` into `sw.js` at the site root, where its scope covers the
 * whole app, and fills in the list of files it caches for offline use.
 */
function serviceWorkerPlugin(): Plugin {
  let publicDir = '';

  return {
    name: 'paydown-service-worker',
    apply: 'build',
    enforce: 'post',
    configResolved(config) {
      publicDir = config.publicDir;
    },
    buildStart() {
      this.emitFile({ type: 'chunk', id: 'src/pwa/worker.ts', fileName: SERVICE_WORKER_FILE });
    },
    generateBundle: {
      // After Vite writes index.html, so the shell is part of the list.
      order: 'post',
      handler(_options, bundle) {
        const built: BuiltFile[] = Object.values(bundle).map((output) =>
          output.type === 'asset'
            ? { fileName: output.fileName, source: output.source }
            : {
                fileName: output.fileName,
                source: output.code,
                lazyOnly: output.moduleIds.some((id) => id.endsWith('set-a.vault.json')),
              },
        );
        const manifest = buildPrecacheManifest([...built, ...publicFiles(publicDir)]);

        const worker = bundle[SERVICE_WORKER_FILE];
        if (worker?.type !== 'chunk' || worker.imports.length > 0) {
          this.error('sw.js must build to one chunk with no imports.');
        }
        const placeholder = /(["'`])__PAYDOWN_PRECACHE__\1/;
        if (!placeholder.test(worker.code)) {
          this.error('sw.js lost its precache placeholder.');
        }
        worker.code = worker.code.replace(placeholder, JSON.stringify(JSON.stringify(manifest)));
      },
    },
  };
}

export default defineConfig({
  base: process.env.BASE_PATH ?? '/paydown/',
  plugins: [react(), tailwindcss(), contentSecurityPolicyPlugin(), serviceWorkerPlugin()],
  build: {
    rolldownOptions: {
      output: {
        manualChunks(id) {
          if (id.includes('node_modules/recharts')) {
            return 'charts';
          }

          if (id.includes('node_modules')) {
            return 'vendor';
          }

          return null;
        },
      },
    },
  },
  test: {
    environment: 'jsdom',
    environmentOptions: { jsdom: { url: 'http://localhost/' } },
    globals: false,
    include: ['tests/**/*.{test,spec}.{ts,tsx}'],
    setupFiles: ['./tests/test-setup.ts'],
  },
});
