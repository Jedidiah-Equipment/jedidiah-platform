// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

const importParts = vi.hoisted(() => vi.fn(() => new Promise(() => {})));
vi.mock('@/lib/trpc.js', () => ({
  useTRPC: () => ({
    parts: { bulkImport: { mutationOptions: (options: object) => ({ ...options, mutationFn: importParts }) } },
  }),
}));
vi.mock('@/equipment/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateParts: async () => {} }),
}));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));

import { PartBulkImportDialog } from './PartBulkImportDialog.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let root: Root;
afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
  importParts.mockClear();
});

function button(name: string) {
  const match = [...document.querySelectorAll('button')].find(
    (item) => item.getAttribute('aria-label') === name || item.textContent?.trim() === name,
  );
  if (!match) throw new Error(`Missing button: ${name}`);
  return match;
}
async function mount() {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () =>
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <PartBulkImportDialog supplier={{ id: '00000000-0000-4000-8000-000000000001', companyName: 'Test Supplier' }} />
      </QueryClientProvider>,
    ),
  );
  await act(async () => button('Bulk parts import').click());
}
async function select(file?: File) {
  const input = document.querySelector<HTMLInputElement>('input[type=file]');
  if (!input) throw new Error('Missing file selector');
  Object.defineProperty(input, 'files', { configurable: true, value: file ? [file] : [] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
}

it('requires a CSV and prevents import while parsing, then removal clears parsed rows', async () => {
  await mount();
  expect(button('Import parts').disabled).toBe(false);
  await act(async () => button('Import parts').click());
  expect(document.querySelector('[role=alert]')?.textContent).toContain('Choose a CSV');
  let finish!: (text: string) => void;
  const file = new File([], 'parts.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', {
    value: () =>
      new Promise<string>((resolve) => {
        finish = resolve;
      }),
  });
  await select(file);
  expect(button('Import parts').disabled).toBe(true);
  expect(importParts).not.toHaveBeenCalled();
  await act(async () =>
    finish(
      'Code,Drawing code,Description,Supplier,Supplier Code,Finish,Category,Name,Unit,Internally Fabricated\nP1,,Seal description,Test Supplier,S1,Steel,Seals,Seal,piece,No',
    ),
  );
  await select();
  expect(document.body.textContent).toContain('parts.csv');
  expect(document.body.textContent).toContain('Seal');
  await act(async () => button('Remove csv file').click());
  expect(document.body.textContent).not.toContain('Seal');
  await act(async () => button('Import parts').click());
  expect(importParts).not.toHaveBeenCalled();
});

it('parses headerless rows in Supplier scope, reports partial results and resets for Import Another', async () => {
  importParts.mockResolvedValueOnce({
    batchId: '00000000-0000-4000-8000-000000000002',
    importedCount: 0,
    updatedCount: 1,
    errors: ['Row 2: unknown Part Category.'],
  });
  await mount();
  await act(async () => document.querySelector<HTMLButtonElement>('[role=checkbox]')?.click());
  const file = new File([], 'headerless.csv', { type: 'text/csv' });
  Object.defineProperty(file, 'text', {
    value: async () => 'P1,,Seal description,Test Supplier,S1,Steel,Seals,Seal,piece,No',
  });
  await select(file);
  expect(document.body.textContent).toContain('Seal');
  await act(async () => button('Import parts').click());
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 10));
  });
  expect(importParts).toHaveBeenCalledWith(
    expect.objectContaining({
      fileName: 'headerless.csv',
      supplierId: '00000000-0000-4000-8000-000000000001',
      rows: [expect.objectContaining({ code: 'P1', lineNumber: 1 })],
    }),
    expect.anything(),
  );
  expect(document.body.textContent).toContain('Row 2: unknown Part Category.');
  expect(document.body.textContent).toContain('Import complete with issues');
  await act(async () => button('Import Another').click());
  expect(document.body.textContent).not.toContain('headerless.csv');
  expect(document.body.textContent).not.toContain('Row 2: unknown Part Category.');
  expect(document.querySelector('[role=checkbox]')?.getAttribute('aria-checked')).toBe('true');
  await act(async () => button('Import parts').click());
  expect(importParts).toHaveBeenCalledOnce();
});
