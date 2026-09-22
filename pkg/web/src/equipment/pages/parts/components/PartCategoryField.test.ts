import { describe, expect, it } from 'vitest';

import { partCategoryPickerItems } from './PartCategoryField.js';

const options = [
  { label: 'Axle', value: '00000000-0000-4000-8000-000000000001' },
  { label: 'Bolt & Nuts', value: '00000000-0000-4000-8000-000000000002' },
];

describe('partCategoryPickerItems', () => {
  it('offers to create a typed name only to people who may create Part Categories', () => {
    const offered = partCategoryPickerItems({
      canCreate: true,
      inputValue: ' Hubs ',
      options,
      selectedLabel: undefined,
    });
    const withheld = partCategoryPickerItems({
      canCreate: false,
      inputValue: 'Hubs',
      options,
      selectedLabel: undefined,
    });

    expect(offered.at(-1)).toMatchObject({ label: 'Hubs' });
    expect(offered).toHaveLength(3);
    expect(withheld).toEqual(options);
  });

  it('never offers a name an existing Part Category already has, ignoring casing', () => {
    expect(partCategoryPickerItems({ canCreate: true, inputValue: 'axle', options, selectedLabel: undefined })).toEqual(
      options,
    );
    expect(partCategoryPickerItems({ canCreate: true, inputValue: '', options, selectedLabel: undefined })).toEqual(
      options,
    );
  });
});
