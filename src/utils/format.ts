const indianCurrency = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
  style: 'currency',
  currency: 'INR',
});

const compactCurrency = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
});

const groupedNumber = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
});

/** Three-letter month names. `en-IN` would print "Sept", which breaks the column rhythm. */
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/**
 * Formats rupees with Indian grouping.
 *
 * @param value - Rupee amount to format.
 * @returns Currency string such as `₹2,50,000`.
 */
export function formatInr(value: number): string {
  return indianCurrency.format(Math.round(value)).replace(/\s/g, '');
}

/**
 * Formats rupees into Indian compact units.
 *
 * @param value - Rupee amount to format.
 * @returns Compact currency string such as `₹2.5L` or `₹1.2Cr`.
 */
export function formatInrShort(value: number): string {
  const sign = value < 0 ? '-' : '';
  const absoluteValue = Math.abs(value);

  if (absoluteValue >= 10_000_000) {
    return `${sign}₹${compactCurrency.format(absoluteValue / 10_000_000)}Cr`;
  }

  if (absoluteValue >= 100_000) {
    return `${sign}₹${compactCurrency.format(absoluteValue / 100_000)}L`;
  }

  if (absoluteValue >= 1_000) {
    return `${sign}₹${compactCurrency.format(Math.round(absoluteValue / 1_000))}K`;
  }

  return `${sign}₹${Math.round(absoluteValue)}`;
}

/**
 * Formats a plain number with Indian digit grouping and no currency symbol.
 *
 * @param value - Number to format.
 * @returns Grouped number such as `1,25,000`.
 */
export function formatGrouped(value: number): string {
  return groupedNumber.format(value);
}

/**
 * Formats a whole-month duration. Negative values keep their sign on the whole duration.
 *
 * @param months - Duration in whole months.
 * @returns Human-readable duration such as `5 yr 11 mo` or `-9 yr 8 mo`.
 */
export function formatDuration(months: number): string {
  if (months < 0) {
    return `-${formatDuration(-months)}`;
  }

  const years = Math.floor(months / 12);
  const remainingMonths = months % 12;

  if (years === 0) {
    return `${remainingMonths} mo`;
  }

  if (remainingMonths === 0) {
    return `${years} yr`;
  }

  return `${years} yr ${remainingMonths} mo`;
}

/**
 * Formats an ISO date as an Indian date label.
 *
 * @param isoDate - ISO date string in `YYYY-MM-DD` format.
 * @returns Date label such as `01 Apr 2023`.
 */
export function formatDate(isoDate: string): string {
  const [year = '0', month = '1', day = '1'] = isoDate.split('-');
  return `${day.padStart(2, '0')} ${monthName(Number(month))} ${year}`;
}

/**
 * Formats an ISO date as month and year.
 *
 * @param isoDate - ISO date string in `YYYY-MM-DD` format.
 * @returns Date label such as `Apr 2023`.
 */
export function formatMonthYear(isoDate: string): string {
  const [year = '0', month = '1'] = isoDate.split('-');
  return `${monthName(Number(month))} ${year}`;
}

/**
 * Formats a percentage value.
 *
 * @param value - Numeric percentage.
 * @param digits - Number of fractional digits.
 * @returns Percentage string such as `9.15%`.
 */
export function formatPercent(value: number, digits = 2): string {
  return `${value.toFixed(digits)}%`;
}

/**
 * Formats a gap between two rates in percentage points, without a sign.
 *
 * @param value - Difference between two annual rates.
 * @returns Label such as `0.80 pts`.
 */
export function formatPoints(value: number): string {
  return `${Math.abs(value).toFixed(2)} pts`;
}

/**
 * Picks the singular or plural form of a noun for a count.
 *
 * @param count - How many items there are.
 * @param singular - Noun used when the count is exactly one.
 * @param plural - Noun used otherwise; defaults to `singular` plus "s".
 * @returns Phrase such as `1 payment` or `3 payments`.
 */
export function pluralize(count: number, singular: string, plural = `${singular}s`): string {
  return `${count} ${count === 1 ? singular : plural}`;
}

/**
 * Converts an ISO date string to a local date at noon.
 *
 * @param isoDate - ISO date string in `YYYY-MM-DD` format.
 * @returns Local `Date` object set to noon to avoid timezone date shifts.
 */
export function dateFromIso(isoDate: string): Date {
  const [year = '0', month = '1', day = '1'] = isoDate.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day), 12);
}

function monthName(month: number): string {
  return MONTHS[month - 1] ?? '';
}
