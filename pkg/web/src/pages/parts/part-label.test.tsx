import type { Part, PartLabelBatchSelection, UUID } from '@pkg/schema';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, test, vi } from 'vitest';
import { DataTable } from '@/components/data-table/DataTable.js';
import { useDataTable } from '@/components/data-table/features.js';
import { createPartLabelActionColumn } from './components/PartTable.js';
import { PartLabelPrintButton } from './PartLabelPrintButton.js';
import { openPartLabelBatchPdf, partLabelBatchUrl, partLabelUrl } from './part-label.js';

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

  test('posts high-cardinality copy selections without putting them in the request URL', async () => {
    const pdf = new Blob(['%PDF-label'], { type: 'application/pdf' });
    const fetchMock = vi.fn(async (_input: RequestInfo | URL, _init?: RequestInit) => new Response(pdf));
    const replace = vi.fn();
    const preview = { close: vi.fn(), location: { replace }, opener: {} };
    stubClientConfig({ open: vi.fn(() => preview) });
    vi.stubGlobal('fetch', fetchMock);
    const createObjectURL = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:part-labels');

    const copies = Array.from({ length: 380 }, (_, index) => ({ copies: 1, partId: uuidFor(index) }));
    await openPartLabelBatchPdf({ copies, selection: 'ids' });

    const call = fetchMock.mock.calls[0];
    if (!call) throw new Error('Part label request was not sent');
    const [url, request] = call;
    expect(url).toBe('http://localhost:7002/api/parts/labels');
    expect(request).toMatchObject({
      body: JSON.stringify({ copies, selection: 'ids' }),
      credentials: 'include',
      headers: { 'content-type': 'application/json' },
      method: 'POST',
    });
    expect(String(request?.body).length).toBeGreaterThan(16_384);
    expect(createObjectURL).toHaveBeenCalledWith(pdf);
    expect(replace).toHaveBeenCalledWith('blob:part-labels');
  });
});

function PartLabelActionTable() {
  const table = useDataTable({
    columns: [createPartLabelActionColumn()],
    data: [{ id: PART_ID } as Part],
  });

  return <DataTable emptyMessage="No parts" hideGlobalFilter paginationMode="complete" table={table} total={1} />;
}

function stubClientConfig(overrides: Record<string, unknown> = {}): void {
  vi.stubGlobal('window', {
    __APP_CONFIG__: {
      appBaseUrl: 'http://localhost:7001',
      appEnv: 'development',
      apiBaseUrl: 'http://localhost:7002',
      authBaseUrl: 'http://localhost:7002/api/auth',
      docsBaseUrl: 'http://localhost:7006',
    },
    ...overrides,
  });
}

function uuidFor(index: number): UUID {
  return `00000000-0000-4000-8000-${String(index).padStart(12, '0')}` as UUID;
}
