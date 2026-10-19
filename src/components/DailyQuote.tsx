import quotesCsv from '../data/quotes.csv?raw';
import { parseCsv } from '../utils/csv';

export type Quote = {
  id: number;
  quote: string;
  author: string;
  topic: string;
  source: string;
  sourceUrl: string;
};

const DAY_MS = 86_400_000;

/**
 * The curated quotes about debt, saving, patience and persistence. Every one comes from a
 * public-domain book, named with its Project Gutenberg link in `src/data/quotes.csv`.
 */
export const QUOTES: Quote[] = toQuotes(parseCsv(quotesCsv));

/**
 * Picks the quote for a calendar day. The same day always gets the same quote, and the
 * list is walked with a stride that shares no factor with its length, so neighbouring days
 * come from different parts of the list and every quote shows once before any repeats.
 *
 * @param isoDate - Day in `YYYY-MM-DD` format.
 * @param quotes - List to pick from.
 * @returns That day's quote, or `undefined` for an empty list.
 */
export function quoteForDate(isoDate: string, quotes: Quote[] = QUOTES): Quote | undefined {
  if (quotes.length === 0) {
    return undefined;
  }

  const [year = 1970, month = 1, day = 1] = isoDate.split('-').map(Number);
  const dayNumber = Math.floor(Date.UTC(year, month - 1, day) / DAY_MS);
  const stride = strideFor(quotes.length);
  const index = (((dayNumber * stride) % quotes.length) + quotes.length) % quotes.length;

  return quotes[index];
}

/**
 * Today's quote with its author, for the dashboard hero. Loaded lazily so the quote list
 * never delays the first paint.
 *
 * @param props - Quote props.
 * @param props.date - Day the quote is for, in `YYYY-MM-DD` format.
 * @returns Quote figure, or nothing when the list is empty.
 */
export default function DailyQuote({ date }: { date: string }) {
  const quote = quoteForDate(date);

  if (quote === undefined) {
    return null;
  }

  return (
    <figure className="hero-quote">
      <blockquote>
        <p>{quote.quote}</p>
      </blockquote>
      <figcaption>{quote.author}</figcaption>
    </figure>
  );
}

function strideFor(length: number): number {
  let stride = 7919;
  while (greatestCommonDivisor(stride, length) !== 1) {
    stride += 1;
  }
  return stride;
}

function greatestCommonDivisor(left: number, right: number): number {
  return right === 0 ? left : greatestCommonDivisor(right, left % right);
}

function toQuotes(rows: string[][]): Quote[] {
  const [header = [], ...body] = rows;
  const column = (name: string) => header.indexOf(name);
  const at = (row: string[], name: string) => row[column(name)] ?? '';

  return body
    .map((row) => ({
      id: Number(at(row, 'id')),
      quote: at(row, 'quote'),
      author: at(row, 'author'),
      topic: at(row, 'topic'),
      source: at(row, 'source'),
      sourceUrl: at(row, 'source_url'),
    }))
    .filter((quote) => quote.quote !== '' && quote.author !== '');
}
