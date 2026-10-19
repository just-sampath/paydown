import { Download } from 'lucide-react';

import type { InstallPromptStore } from '../pwa/installPrompt';
import { installPrompt, useInstallState } from '../pwa/installPrompt';
import { Card } from './Primitives';

const MANUAL_HINT =
  "Look in your browser's menu for Install app or Add to Home screen. On iPhone and iPad, tap Share in Safari, then Add to Home Screen.";

/**
 * Offers to install Paydown as an app. Chromium browsers get a button that opens their
 * install prompt; other browsers get directions to their menu. Hidden in the installed app.
 *
 * @param props - Install card props.
 * @param props.store - Install prompt store, the app's own by default.
 * @returns Card element, or nothing when running as the installed app.
 */
export function InstallCard({ store = installPrompt }: { store?: InstallPromptStore }) {
  const state = useInstallState(store);

  if (state === 'standalone') {
    return null;
  }

  return (
    <Card eyebrow="App" title="Install Paydown">
      <div className="settings-row is-action">
        <div>
          <div className="font-bold">
            {state === 'installed' ? 'Paydown is installed' : 'Use Paydown as an app'}
          </div>
          <p className="subtle m-0 mt-1 text-sm">
            {state === 'installed'
              ? 'Open it from your home screen or app list.'
              : 'It opens in its own window and works offline.'}
          </p>
          {state === 'unavailable' && <p className="subtle m-0 mt-1 text-sm">{MANUAL_HINT}</p>}
        </div>
        {state === 'available' && (
          <div className="flex justify-end">
            <button className="btn" type="button" onClick={() => void store.install()}>
              <Download aria-hidden="true" size={16} />
              Install app
            </button>
          </div>
        )}
      </div>
    </Card>
  );
}
