/**
 * Joins truthy CSS class names.
 *
 * @param values - Strings, booleans, nulls, or undefined values to combine.
 * @returns Space-delimited class name string.
 */
export function classNames(...values: Array<string | false | null | undefined>): string {
  return values.filter(Boolean).join(' ');
}
