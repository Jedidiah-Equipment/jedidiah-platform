import { describe, expect, test } from 'vitest';
import { searchSelectRows } from './search-select-rows';

const options = [
  { label: 'Rowley Boerdery', value: 'rowley' },
  { label: 'Steyn', value: 'steyn', description: 'Rooikraal' },
];
const create = { toName: (text: string) => text.trim() || undefined };

describe('searchSelectRows', () => {
  test('lists every option for an empty search and offers nothing to create', () => {
    expect(searchSelectRows(options, '  ', create)).toEqual([
      { kind: 'option', option: options[0] },
      { kind: 'option', option: options[1] },
    ]);
  });

  test('leads with the typed name when no option carries it, keeping the partial matches below', () => {
    expect(searchSelectRows(options, ' Row ', create)).toEqual([
      { kind: 'create', name: 'Row' },
      { kind: 'option', option: options[0] },
    ]);
  });

  test('offers no create when an option already has that name, whatever its case', () => {
    expect(searchSelectRows(options, 'rowley boerdery', create)).toEqual([{ kind: 'option', option: options[0] }]);
  });

  test('offers no create without permission or for text that is not a name', () => {
    expect(searchSelectRows(options, 'Nel')).toEqual([]);
    expect(searchSelectRows(options, 'Nel', { toName: () => undefined })).toEqual([]);
  });
});
