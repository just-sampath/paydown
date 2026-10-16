const indianCurrency = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 0,
  style: 'currency',
  currency: 'INR',
});

const compactCurrency = new Intl.NumberFormat('en-IN', {
  maximumFractionDigits: 2,
});

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
 * Formats a whole-month duration.
 *
 * @param months - Duration in whole months.
 * @returns Human-readable duration such as `5 yr 11 mo`.
 */
export function formatDuration(months: number): string {
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
  return dateFromIso(isoDate).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  });
}

/**
 * Formats an ISO date as month and year.
 *
 * @param isoDate - ISO date string in `YYYY-MM-DD` format.
 * @returns Date label such as `Apr 2023`.
 */
export function formatMonthYear(isoDate: string): string {
  return dateFromIso(isoDate).toLocaleDateString('en-IN', {
    month: 'short',
    year: 'numeric',
  });
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
 * Converts an ISO date string to a local date at noon.
 *
 * @param isoDate - ISO date string in `YYYY-MM-DD` format.
 * @returns Local `Date` object set to noon to avoid timezone date shifts.
 */
export function dateFromIso(isoDate: string): Date {
  const [year = '0', month = '1', day = '1'] = isoDate.split('-');
  return new Date(Number(year), Number(month) - 1, Number(day), 12);
}
