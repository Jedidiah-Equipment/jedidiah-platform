// @vitest-environment jsdom
import type { AppRouter } from '@pkg/api';
import type { PartImportBatch, PartImportBatchDetail } from '@pkg/schema/equipment';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, test, vi } from 'vitest';

import { TRPCProvider } from '@/lib/trpc.js';
import { PartBulkImportDialog } from './PartBulkImportDialog.js';
import { PartLabelBatchDialog } from './PartLabelBatchDialog.js';
import { buildPartBulkExportCsv } from './part-bulk-csv.js';
import { fetchPartLabelsBlob } from './part-label.js';

vi.mock('./part-label.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('./part-label.js')>()),
  fetchPartLabelsBlob: vi.fn(async () => new Blob(['%PDF-label'], { type: 'application/pdf' })),
}));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const BATCH_ID = '11111111-1111-4111-8111-111111111111';
const PART_A = '22222222-2222-4222-8222-222222222222';
const PART_B = '33333333-3333-4333-8333-333333333333';
const PART_C = '44444444-4444-4444-8444-444444444444';

const batch: PartImportBatch = {
  completedAt: '2026-09-30T08:00:00.000Z' as PartImportBatch['completedAt'],
  createdCount: 2,
  fileName: 'new-bearings.csv',
  id: BATCH_ID,
  importedBy: { id: 'importer', name: 'Ada Importer' },
  rejectedCount: 1,
  unchangedCount: 1,
  updatedCount: 1,
};

const detail: PartImportBatchDetail = {
  batch,
  labelCounts: { created: 2, createdAndUpdated: 3 },
  members: [
    member(2, 'A', 'created', PART_A),
    member(3, 'B', 'created', PART_B),
    member(4, 'C', 'updated', PART_C),
    member(5, 'D', 'unchanged', null),
  ],
};

const roots: Root[] = [];

afterEach(async () => {
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
  delete (window as unknown as { __APP_CONFIG__?: unknown }).__APP_CONFIG__;
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('Part Import Batch labels', () => {
  test('offers the new Parts of a finished import straight to the label dialog', async () => {
    const requests = await mount(<PartBulkImportDialog />);

    await act(async () => buttonByText('Bulk parts import').click());
    await chooseCsv('new-bearings.csv');
    await act(async () => document.querySelector<HTMLButtonElement>('button[type="submit"]')?.click());
    await vi.waitFor(() => expect(buttonByText('Print new Part labels')).toBeTruthy());

    expect(requests.find((request) => request.path === 'parts.bulkImport')?.body).toMatchObject({
      fileName: 'new-bearings.csv',
    });

    await act(async () => buttonByText('Print new Part labels').click());
    await vi.waitFor(() => expect(document.body.textContent).toContain('2 labels to print'));

    await act(async () => buttonByText('Open printable PDF').click());
    expect(fetchPartLabelsBlob).toHaveBeenLastCalledWith({
      selection: { batchId: BATCH_ID, includeUpdated: false, selection: 'importBatch' },
      signal: expect.any(AbortSignal),
    });
  });

  test('reopens an import from Recent imports on Inventory, even with no stock on hand', async () => {
    await mount(<PartLabelBatchDialog parts={[]} />);

    await act(async () => buttonByText('Print labels').click());
    await chooseMode('Recent imports');
    await vi.waitFor(() => expect(document.body.textContent).toContain('new-bearings.csv'));
    await act(async () => rowByText('new-bearings.csv').click());
    await vi.waitFor(() => expect(document.body.textContent).toContain('2 labels to print'));

    await act(async () => document.querySelector<HTMLButtonElement>('#part-label-include-updated')?.click());
    expect(document.body.textContent).toContain('3 labels to print');
    await act(async () => buttonByText('Open printable PDF').click());
    expect(fetchPartLabelsBlob).toHaveBeenLastCalledWith({
      selection: { batchId: BATCH_ID, includeUpdated: true, selection: 'importBatch' },
      signal: expect.any(AbortSignal),
    });
  });
});

async function mount(node: React.ReactNode) {
  (window as unknown as { __APP_CONFIG__: unknown }).__APP_CONFIG__ = {
    apiBaseUrl: 'http://localhost:7102',
    appBaseUrl: 'http://localhost:7101',
    appEnv: 'development',
    authBaseUrl: 'http://localhost:7102/api/auth',
  };
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:part-labels');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const requests: Array<{ body: unknown; path: string }> = [];
  const queryClient = new QueryClient({ defaultOptions: { mutations: { retry: false }, queries: { retry: false } } });
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        fetch: async (input, init) => {
          const path = new URL(String(input)).pathname.slice('/trpc/'.length);
          requests.push({ body: init?.body ? JSON.parse(String(init.body)) : undefined, path });
          return Response.json({ result: { data: respond(path) } });
        },
        url: 'http://part-imports.test/trpc',
      }),
    ],
  });
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () =>
    root.render(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
          {node}
        </TRPCProvider>
      </QueryClientProvider>,
    ),
  );

  return requests;
}

function respond(path: string): unknown {
  switch (path) {
    case 'parts.bulkImport':
      return { batchId: BATCH_ID, errors: [], importedCount: 2, updatedCount: 1 };
    case 'parts.importBatches':
      return { items: [batch], nextCursor: null, total: 1 };
    case 'parts.importBatch':
      return detail;
    case 'parts.categories':
      return { categories: [] };
    case 'parts.locations':
      return { locations: [] };
    default:
      throw new Error(`Unexpected request ${path}`);
  }
}

async function chooseCsv(name: string) {
  const csv = buildPartBulkExportCsv([
    {
      category: 'Bearings',
      code: 'A',
      description: 'A description',
      drawingCode: null,
      finish: 'Zinc',
      isInternallyFabricated: false,
      name: 'A name',
      supplierCode: 'SUP-A',
      supplierName: 'Acme Supplies',
      unitOfMeasure: 'piece',
    },
  ]);
  const input = document.querySelector<HTMLInputElement>('#parts-import-file');
  if (!input) throw new Error('CSV file input missing');
  Object.defineProperty(input, 'files', { configurable: true, value: [new File([csv], name, { type: 'text/csv' })] });
  await act(async () => {
    input.dispatchEvent(new Event('change', { bubbles: true }));
  });
  await vi.waitFor(() => expect(document.body.textContent).toContain('Ready to import'));
}

async function chooseMode(label: string) {
  await act(async () => document.querySelector<HTMLButtonElement>('#part-label-batch-mode')?.click());
  const option = await vi.waitFor(() => {
    const found = [...document.querySelectorAll<HTMLElement>('[role="option"]')].find(
      (candidate) => candidate.textContent?.trim() === label,
    );
    if (!found) throw new Error(`Option missing: ${label}`);
    return found;
  });
  await act(async () => option.click());
}

function buttonByText(label: string): HTMLButtonElement {
  const found = [...document.querySelectorAll<HTMLButtonElement>('button')].find(
    (candidate) => candidate.textContent?.trim() === label,
  );
  if (!found) throw new Error(`Button missing: ${label}`);
  return found;
}

function rowByText(text: string): HTMLElement {
  const found = [...document.querySelectorAll<HTMLElement>('tr')].find((row) => row.textContent?.includes(text));
  if (!found) throw new Error(`Row missing: ${text}`);
  return found;
}

function member(
  lineNumber: number,
  code: string,
  outcome: PartImportBatchDetail['members'][number]['outcome'],
  partId: string | null,
): PartImportBatchDetail['members'][number] {
  return {
    importedCode: code,
    importedName: `${code} name`,
    lineNumber,
    outcome,
    part: partId ? { code, id: partId, name: `${code} name`, storageLocation: null } : null,
  };
}
