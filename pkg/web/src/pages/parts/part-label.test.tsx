import type { Part, PartLabelBatchSelection, UUID } from '@pkg/schema';
import { getCoreRowModel, useReactTable } from '@tanstack/react-table';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { DataTable } from '@/components/data-table/DataTable.js';
import { createPartLabelActionColumn } from './components/PartTable.js';
import { PartLabelPrintButton } from './PartLabelPrintButton.js';
import { partLabelBatchModeLabels, partLabelBatchUrl, partLabelUrl } from './part-label.js';

const PART_ID = '22222222-2222-4222-8222-222222222222' as UUID;
const OTHER_PART_ID = '33333333-3333-4333-8333-333333333333' as UUID;

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('Part label actions', () => {
  test('uses user-facing labels for batch selection modes', () => {
    expect(partLabelBatchModeLabels).toEqual({
      all: 'All Parts',
      category: 'By category',
      ids: 'Choose Parts',
      storageLocation: 'By storage location',
    });
  });

  test('exports a single-Part print affordance that opens the label PDF', () => {
    stubClientConfig();

    expect(partLabelUrl(PART_ID)).toBe('http://localhost:7002/api/parts/22222222-2222-4222-8222-222222222222/label');
    const markup = renderToStaticMarkup(<PartLabelPrintButton partId={PART_ID} />);
    expect(markup).toContain('target="_blank"');
    expect(markup).toContain('/api/parts/22222222-2222-4222-8222-222222222222/label');
    expect(markup).toContain('Print label');
  });

  test('keeps single-Part printing reachable from every Part table row', () => {
    stubClientConfig();

    const markup = renderToStaticMarkup(<PartLabelActionTable />);

    expect(markup).toContain('Print label');
    expect(markup).toContain('/api/parts/22222222-2222-4222-8222-222222222222/label');
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

function PartLabelActionTable() {
  const table = useReactTable({
    columns: [createPartLabelActionColumn()],
    data: [{ id: PART_ID } as Part],
    getCoreRowModel: getCoreRowModel(),
  });

  return <DataTable emptyMessage="No parts" hideGlobalFilter paginationMode="complete" table={table} total={1} />;
}

function stubClientConfig(): void {
  vi.stubGlobal('window', {
    __APP_CONFIG__: {
      appBaseUrl: 'http://localhost:7001',
      appEnv: 'development',
      apiBaseUrl: 'http://localhost:7002',
      authBaseUrl: 'http://localhost:7002/api/auth',
      docsBaseUrl: 'http://localhost:5173',
    },
  });
}
