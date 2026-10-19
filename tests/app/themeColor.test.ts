import { afterEach, describe, expect, test } from 'vitest';

import { syncThemeColor } from '../../src/app/themeColor';

describe('syncThemeColor', () => {
  afterEach(() => {
    document.head.innerHTML = '';
    delete document.documentElement.dataset.theme;
  });

  test('copies the page background token into the theme-color tag', () => {
    document.head.innerHTML = `
      <meta name="theme-color" content="#000000" />
      <style>
        :root { --surface-2: #f7f9fa; }
        [data-theme='dark'] { --surface-2: #121212; }
      </style>`;
    const meta = document.querySelector('meta[name="theme-color"]');

    syncThemeColor();
    expect(meta?.getAttribute('content')).toBe('#f7f9fa');

    document.documentElement.dataset.theme = 'dark';
    syncThemeColor();
    expect(meta?.getAttribute('content')).toBe('#121212');
  });

  test('leaves the tag alone when the token is missing', () => {
    document.head.innerHTML = '<meta name="theme-color" content="#0b0a07" />';

    syncThemeColor();

    expect(document.querySelector('meta[name="theme-color"]')?.getAttribute('content')).toBe(
      '#0b0a07',
    );
  });

  test('does nothing without a theme-color tag', () => {
    expect(() => syncThemeColor()).not.toThrow();
  });
});
