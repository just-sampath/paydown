/**
 * Parses CSV text: fields split by commas, rows by line breaks, and fields that hold commas,
 * quotes or line breaks wrapped in double quotes, with `""` for a quote inside one.
 *
 * @param text - CSV text, with LF or CRLF line endings.
 * @returns Rows of fields, without a trailing empty row.
 */
export function parseCsv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let index = 0;

  while (index < text.length) {
    const { value, end } = readField(text, index);
    row.push(value);
    index = end;

    const separator = text.charAt(index);
    if (separator === ',') {
      index += 1;
      continue;
    }

    rows.push(row);
    row = [];
    index += text.startsWith('\r\n', index) ? 2 : 1;
  }

  return rows;
}

/** Reads one field starting at `start`, returning its text and where it stopped. */
function readField(text: string, start: number): { value: string; end: number } {
  if (text.charAt(start) !== '"') {
    let end = start;
    while (end < text.length && !',\r\n'.includes(text.charAt(end))) {
      end += 1;
    }
    return { value: text.slice(start, end), end };
  }

  let value = '';
  let index = start + 1;

  while (index < text.length) {
    const char = text.charAt(index);
    if (char === '"' && text.charAt(index + 1) === '"') {
      value += '"';
      index += 2;
    } else if (char === '"') {
      return { value, end: index + 1 };
    } else {
      value += char;
      index += 1;
    }
  }

  return { value, end: index };
}
