import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { SearchableCombobox } from './SearchableCombobox.js';

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
