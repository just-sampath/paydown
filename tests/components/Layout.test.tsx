import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { AppLayout } from '../../src/components/Layout';

describe('application layout', () => {
  test('labels icon navigation and does not show a dead payment action', () => {
    const markup = renderToStaticMarkup(
      <AppLayout
        activePage="dashboard"
        onNavigate={() => undefined}
        loanLabel="Sample loan · ₹45L"
        loanDetail="Started Apr 2023"
      >
        <div>content</div>
      </AppLayout>,
    );

    expect(markup).toContain('aria-label="Dashboard"');
    expect(markup).toContain('title="Dashboard"');
    expect(markup).not.toContain('Log payment');
    expect(markup).toContain('Sample loan · ₹45L');
  });
});
