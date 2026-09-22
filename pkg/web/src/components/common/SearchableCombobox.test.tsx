import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { creatableItem, SEARCHABLE_COMBOBOX_CREATE_VALUE, SearchableCombobox } from './SearchableCombobox.js';

const options = [
  { label: 'CONS-0023 · Cat 2 Lower Link Weld On Ball End', value: 'part-id-1' },
  { label: 'Bearing & Bolt', value: 'supplier-id-1' },
];

describe('SearchableCombobox', () => {
  it.each([
    ['part-id-1', 'CONS-0023 · Cat 2 Lower Link Weld On Ball End'],
    ['supplier-id-1', 'Bearing & Bolt'],
  ])('renders the selected %s option label while submitting its id', (selectedId, selectedLabel) => {
    const html = renderToStaticMarkup(
      <SearchableCombobox inputId="entity" onValueChange={vi.fn()} options={options} value={selectedId} />,
    );

    expect(html).toContain(`id="entity"`);
    expect(html).toContain(`value="${selectedLabel.replace('&', '&amp;')}"`);
    expect(html).toContain(`aria-hidden="true" value="${selectedId}"`);
  });
});

describe('creatableItem', () => {
  const create = { toName: (inputValue: string) => inputValue.trim().replaceAll(/ +/g, ' ') || undefined };

  it('offers a typed name no option holds, spelled the way it would be stored', () => {
    expect(creatableItem({ create, inputValue: '  Hubs   & Spokes ', options, selectedOption: null })).toEqual({
      label: 'Hubs & Spokes',
      value: SEARCHABLE_COMBOBOX_CREATE_VALUE,
    });
  });

  it.each(['bearing & bolt', 'Bearing  &  Bolt', '   ', ''])(
    'never offers %j, which an option already holds',
    (inputValue) => {
      expect(creatableItem({ create, inputValue, options, selectedOption: null })).toBeUndefined();
    },
  );

  it('never offers the selected option label still sitting in the input', () => {
    const selectedOption = { label: 'Elsewhere', value: 'x' };
    expect(creatableItem({ create, inputValue: 'Elsewhere', options, selectedOption })).toBeUndefined();
  });

  it('compares by the lookup key when one is given', () => {
    const lookupKey = (name: string) => name.replaceAll(/[^a-z]/gi, '').toLowerCase();
    expect(
      creatableItem({ create: { ...create, lookupKey }, inputValue: 'BEARING BOLT', options, selectedOption: null }),
    ).toBeUndefined();
  });
});
