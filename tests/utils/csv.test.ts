import { describe, expect, test } from 'vitest';

import { parseCsv } from '../../src/utils/csv';

describe('csv', () => {
  test('reads quoted commas, doubled quotes, CRLF and empty last fields', () => {
    expect(parseCsv('a,b\n"c, d","say ""hi"""\r\ne,\n')).toEqual([
      ['a', 'b'],
      ['c, d', 'say "hi"'],
      ['e', ''],
    ]);
  });

  test('keeps the last row when the text has no final line break', () => {
    expect(parseCsv('id,quote\n1,Waste not')).toEqual([
      ['id', 'quote'],
      ['1', 'Waste not'],
    ]);
  });
});
