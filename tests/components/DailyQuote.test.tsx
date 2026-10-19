import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, test } from 'vitest';

import DailyQuote, { QUOTES, quoteForDate } from '../../src/components/DailyQuote';

const DAY_MS = 86_400_000;

function textOf(markup: string): string {
  const host = document.createElement('div');
  host.innerHTML = markup;
  return host.textContent ?? '';
}

describe('daily quote', () => {
  test('ships 600 English quotes, each with an author and a public-domain source', () => {
    const topics = new Set([
      'debt',
      'saving',
      'patience',
      'persistence',
      'habit',
      'hope',
      'freedom',
    ]);

    expect(QUOTES).toHaveLength(600);
    expect(new Set(QUOTES.map((quote) => quote.id)).size).toBe(600);
    expect(new Set(QUOTES.map((quote) => quote.quote)).size).toBe(600);
    expect(QUOTES.filter((quote) => quote.topic === 'debt').length).toBeGreaterThan(40);

    for (const quote of QUOTES) {
      expect(quote.author).not.toBe('');
      expect(quote.source).not.toBe('');
      expect(quote.sourceUrl).toMatch(/^https:\/\/www\.gutenberg\.org\/ebooks\/\d+$/);
      expect(quote.quote).not.toMatch(/[–—“”]|--|�/);
      expect(topics.has(quote.topic)).toBe(true);
    }
  });

  test('keeps one quote per day and shows every quote once before any repeats', () => {
    const start = Date.UTC(2026, 0, 1);
    const seen = new Set<number | undefined>();

    for (let day = 0; day < QUOTES.length; day += 1) {
      seen.add(quoteForDate(new Date(start + day * DAY_MS).toISOString().slice(0, 10))?.id);
    }

    expect(quoteForDate('2026-08-15')).toEqual(quoteForDate('2026-08-15'));
    expect(quoteForDate('2026-08-16')?.id).not.toBe(quoteForDate('2026-08-15')?.id);
    expect(seen.size).toBe(QUOTES.length);
    expect(quoteForDate('2026-08-15', [])).toBeUndefined();
  });

  test('shows the quote with its author', () => {
    const quote = quoteForDate('2026-08-15');
    const text = textOf(renderToStaticMarkup(<DailyQuote date="2026-08-15" />));

    expect(text).toContain(quote?.quote);
    expect(text).toContain(quote?.author);
  });
});
