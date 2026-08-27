// @vitest-environment jsdom

import type { Part } from '@pkg/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

import { useAppForm } from '@/components/form/index.js';

vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));
vi.mock('@/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateJobs: vi.fn(), invalidatePurchaseOrders: vi.fn() }),
}));
vi.mock('@/lib/trpc.js', () => ({ useTRPC: () => ({}) }));

import { PurchaseOrderLinesEditor } from './PurchaseOrderDetailPage.js';

type PurchaseOrderPartOption = Part & { averageUnitCost: number | null };

const supplierId = '762b0045-d030-4897-918d-dc50eea5469c';
const partId = '4de0e2a1-2b2f-4b2e-9a5f-6a0d0a1b2c3d';
const part: PurchaseOrderPartOption = {
  averageUtilizationPercent: null,
  averageUnitCost: 0.3,
  category: 'Fasteners',
  code: 'BN1-0324',
  description: 'M12 Flatwasher',
  drawingCode: null,
  finish: 'Zinc',
  id: partId,
  isInternallyFabricated: false,
  minimumStock: null,
  name: 'M12 Flatwasher',
  standardPurchaseLengthMm: null,
  stockTrackingMode: 'perpetual',
  storageLocation: null,
  supplier: { companyName: 'Bolt & Nut', id: supplierId },
  supplierCode: 'M12-FW',
  supplierId,
  unitOfMeasure: 'piece',
  unitOfMeasureLocked: false,
};
const replacementPart: PurchaseOrderPartOption = {
  ...part,
  averageUnitCost: 1.2,
  code: 'BN1-0292',
  id: '6ec36119-5d1f-4ab4-a3a8-766c08edf414',
  name: 'M12 Locknut',
  supplierCode: 'M12-LN',
};

const roots: Array<ReturnType<typeof createRoot>> = [];
const containers: HTMLDivElement[] = [];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  for (const container of containers) container.remove();
  roots.length = 0;
  containers.length = 0;
});

it('seeds a manually added line from the Part current moving average', async () => {
  let readLines = (): Array<{ partId: string; quantity: number; unitPrice: number }> => [];
  const Harness = () => {
    const form = useAppForm({
      defaultValues: { expectedDeliveryDate: '', jobIds: [], lines: [], supplierId },
    });
    readLines = () => form.state.values.lines;

    return (
      <PurchaseOrderLinesEditor
        commit={vi.fn()}
        form={form as never}
        isLoading={false}
        parts={[part]}
        partsLoadFailed={false}
      />
    );
  };

  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => root.render(<Harness />));
  const addLine = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Add line'));
  if (!addLine) throw new Error('Add line button did not render');

  await act(async () => addLine.click());

  expect(readLines()).toEqual([{ partId, quantity: 1, unitPrice: 0.3 }]);
});

it('explains why a line cannot be added when the Supplier has no available Parts', async () => {
  const Harness = () => {
    const form = useAppForm({
      defaultValues: { expectedDeliveryDate: '', jobIds: [], lines: [], supplierId },
    });

    return (
      <PurchaseOrderLinesEditor
        commit={vi.fn()}
        form={form as never}
        isLoading={false}
        parts={[]}
        partsLoadFailed={false}
      />
    );
  };

  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => root.render(<Harness />));

  const addLine = [...container.querySelectorAll('button')].find((button) => button.textContent?.includes('Add line'));
  expect(addLine?.disabled).toBe(true);
  expect(container.textContent).toContain('Add a Part for this Supplier before adding a line.');
});

it('reports a Part loading failure instead of claiming the Supplier has no Parts', async () => {
  const Harness = () => {
    const form = useAppForm({
      defaultValues: { expectedDeliveryDate: '', jobIds: [], lines: [], supplierId },
    });

    return (
      <PurchaseOrderLinesEditor commit={vi.fn()} form={form as never} isLoading={false} parts={[]} partsLoadFailed />
    );
  };

  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);

  await act(async () => root.render(<Harness />));

  expect(container.textContent).toContain('Parts could not be loaded. Try again.');
  expect(container.textContent).not.toContain('Add a Part for this Supplier before adding a line.');
});

it('re-seeds the default when a draft line changes to another Part', async () => {
  let readLines = (): Array<{ partId: string; quantity: number; unitPrice: number }> => [];
  const Harness = () => {
    const form = useAppForm({
      defaultValues: {
        expectedDeliveryDate: '',
        jobIds: [],
        lines: [{ partId, quantity: 1, unitPrice: 0.3 }],
        supplierId,
      },
    });
    readLines = () => form.state.values.lines;

    return (
      <PurchaseOrderLinesEditor
        commit={vi.fn()}
        form={form as never}
        isLoading={false}
        parts={[part, replacementPart]}
        partsLoadFailed={false}
      />
    );
  };

  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(<Harness />));

  const partPicker = container.querySelector<HTMLInputElement>('input[placeholder="Search parts"]');
  if (!partPicker) throw new Error('Part picker did not render');
  await act(async () => {
    partPicker.focus();
    partPicker.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, key: 'ArrowDown' }));
  });

  const replacement = [...document.querySelectorAll<HTMLElement>('[data-slot="combobox-item"]')].find((item) =>
    item.textContent?.includes('M12 Locknut'),
  );
  if (!replacement) throw new Error('Replacement Part option did not render');
  await act(async () => replacement.click());

  expect(readLines()).toEqual([{ partId: replacementPart.id, quantity: 1, unitPrice: 1.2 }]);
});
