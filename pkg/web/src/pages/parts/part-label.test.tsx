import type { PartLabelBatchSelection, UUID } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { PartLabelPrintButton } from './PartLabelPrintButton.js';
import { partLabelBatchUrl, partLabelUrl } from './part-label.js';

const PART_ID = '22222222-2222-4222-8222-222222222222' as UUID;
const OTHER_PART_ID = '33333333-3333-4333-8333-333333333333' as UUID;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Part label actions', () => {
  test('exports a single-Part print affordance that opens the label PDF', () => {
    stubClientConfig();

    expect(partLabelUrl(PART_ID)).toBe('http://localhost:7002/api/parts/22222222-2222-4222-8222-222222222222/label');
    const markup = renderToStaticMarkup(<PartLabelPrintButton partId={PART_ID} />);
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('/api/parts/22222222-2222-4222-8222-222222222222/label');
    expect(markup).toContain('Print label');
  });

  test.each([
    [{ selection: 'all' }, 'selection=all'],
    [{ category: 'Bright bar', selection: 'category' }, 'selection=category&amp;category=Bright+bar'],
    [
      { selection: 'storageLocation', storageLocation: 'Rack A/04' },
      'selection=storageLocation&amp;storageLocation=Rack+A%2F04',
    ],
    [{ ids: [PART_ID, OTHER_PART_ID], selection: 'ids' }, `selection=ids&amp;ids=${PART_ID}%2C${OTHER_PART_ID}`],
  ] satisfies Array<[PartLabelBatchSelection, string]>)('serializes the %s batch selection', (selection, query) => {
    stubClientConfig();
    expect(partLabelBatchUrl(selection)).toBe(
      `http://localhost:7002/api/parts/labels?${query.replaceAll('&amp;', '&')}`,
    );
  });
});

function stubClientConfig(): void {
  vi.stubGlobal('window', {
    __APP_CONFIG__: {
      appBaseUrl: 'http://localhost:7001',
      appEnv: 'development',
      apiBaseUrl: 'http://localhost:7002',
      authBaseUrl: 'http://localhost:7002/api/auth',
    },
  });
}
