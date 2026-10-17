import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import { AppLayout } from '../../src/components/Layout';

describe('application layout', () => {
  test('labels every nav item with full and short names and keeps one page heading', () => {
    const markup = renderToStaticMarkup(
      <AppLayout
        activePage="whatif"
        onNavigate={() => undefined}
        loanLabel="Sample loan · ₹45L"
        loanDetail="First EMI Apr 2023"
      >
        <div>content</div>
      </AppLayout>,
    );

    expect(markup).toContain('aria-label="Dashboard"');
    expect(markup).toContain('aria-label="Part payments"');
    expect(markup).toContain('>Prepay<');
    expect(markup).toContain('aria-current="page"');
    expect(markup.match(/<h1/g)).toHaveLength(1);
    expect(markup).toContain('<h1>What-if</h1>');
    expect(markup).toContain('Sample loan · ₹45L');
  });
});
