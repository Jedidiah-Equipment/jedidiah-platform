// @vitest-environment jsdom

import type { PurchaseOrderView } from '@pkg/schema/equipment';
import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({ canReadAudit: true }));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));
vi.mock('@/hooks/use-access.js', () => ({
  useAccess: vi.fn(),
  useCan: () => ({ can: access.canReadAudit }),
}));
vi.mock('./components/PurchaseOrderAmendDialog.js', () => ({
  PurchaseOrderAmendDialog: ({ line }: { line: PurchaseOrderView['lines'][number] | null }) => (
    <div data-testid="amendment-line">{line?.description ?? 'new Part Line'}</div>
  ),
}));

import { PurchaseOrderDetailTabs, ReadOnlyLinesCard } from './PurchaseOrderDetailPage.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const mountedContainers: HTMLDivElement[] = [];
const mountedRoots: Array<ReturnType<typeof createRoot>> = [];
afterEach(() => {
  for (const root of mountedRoots) act(() => root.unmount());
  mountedRoots.length = 0;
  for (const container of mountedContainers) container.remove();
  mountedContainers.length = 0;
  access.canReadAudit = true;
});

describe('PurchaseOrderDetailTabs', () => {
  it('keeps the audit tab hidden from readers without audit access', async () => {
    access.canReadAudit = false;
    const container = await mountNode(
      <PurchaseOrderDetailTabs purchaseOrderId={'00000000-0000-4000-8000-000000000024'}>
        <div>Current purchase order details</div>
      </PurchaseOrderDetailTabs>,
    );

    expect(container.textContent).toContain('Details');
    expect(container.textContent).toContain('Current purchase order details');
    expect(container.textContent).not.toContain('Audit');
  });
});

it('starts a sent order Part amendment without selecting a Custom Line', async () => {
  const purchaseOrder = {
    id: '00000000-0000-4000-8000-000000000024',
    lines: [
      {
        description: 'Packing tape',
        id: '00000000-0000-4000-8000-000000000025',
        kind: 'custom',
        partCode: null,
        partId: null,
        quantity: 2.5,
        receivedQuantity: 0,
        unit: 'box',
      },
      {
        description: 'Bearing',
        hasStockMovements: false,
        id: '00000000-0000-4000-8000-000000000026',
        kind: 'part',
        partCode: 'P-100',
        partId: '00000000-0000-4000-8000-000000000027',
        quantity: 1,
        receivedQuantity: 0,
        unitOfMeasure: 'piece',
      },
    ],
  } as unknown as PurchaseOrderView;
  const container = await mountNode(<ReadOnlyLinesCard canAmend canReadCosts={false} purchaseOrder={purchaseOrder} />);
  const addLine = [...container.querySelectorAll('button')].find((button) => button.textContent?.trim() === 'Add line');
  if (!addLine) throw new Error('Add line action missing');
  await act(async () => addLine.click());

  expect(container.querySelector('[data-testid="amendment-line"]')?.textContent).toBe('new Part Line');
});

async function mountNode(node: ReactNode): Promise<HTMLDivElement> {
  const container = document.createElement('div');
  document.body.append(container);
  mountedContainers.push(container);
  const root = createRoot(container);
  mountedRoots.push(root);

  await act(async () => {
    root.render(node);
  });

  return container;
}
