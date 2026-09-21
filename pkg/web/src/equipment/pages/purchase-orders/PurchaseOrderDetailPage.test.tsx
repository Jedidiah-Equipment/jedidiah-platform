// @vitest-environment jsdom

import { act, type ReactNode } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

const access = vi.hoisted(() => ({ canReadAudit: true }));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));
vi.mock('@/hooks/use-access.js', () => ({
  useAccess: vi.fn(),
  useCan: () => ({ can: access.canReadAudit }),
}));

import { PurchaseOrderDetailTabs } from './PurchaseOrderDetailPage.js';

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
