// @vitest-environment jsdom

import type { AppRouter } from '@pkg/api';
import { createUserAccessSummary } from '@pkg/domain';
import { derivePurchaseOrderActions } from '@pkg/domain/equipment';
import { type Part, PurchaseOrderSaveDraftInput, PurchaseOrderView } from '@pkg/schema/equipment';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { createMemoryHistory, createRootRoute, createRouter, RouterProvider } from '@tanstack/react-router';
import { createTRPCClient, httpLink } from '@trpc/client';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { Toaster, toast } from 'sonner';
import { afterEach, expect, it, vi } from 'vitest';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs.js';

import { createTrpcOptions, TRPCProvider } from '@/lib/trpc.js';
import { PurchaseOrderEditing } from './PurchaseOrderEditing.js';

vi.hoisted(() => {
  Object.assign(window, {
    __APP_CONFIG__: {
      appBaseUrl: 'http://purchase-order.test',
      appEnv: 'test',
      apiBaseUrl: 'http://purchase-order.test',
      authBaseUrl: 'http://purchase-order.test/api/auth',
    },
  });
});

const supplierId = '762b0045-d030-4897-918d-dc50eea5469c';
const partId = '4de0e2a1-2b2f-4b2e-9a5f-6a0d0a1b2c3d';
const part: Part = {
  averageUtilizationPercent: null,
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
const purchaseOrder = PurchaseOrderView.parse({
  actions: derivePurchaseOrderActions({
    closedShortAt: null,
    hasAnyMovement: false,
    isEmpty: false,
    progress: 'sent',
    status: 'draft',
  }),
  approvedAt: null,
  closedShortAt: null,
  code: 'PO-00024',
  createdAt: '2026-09-05T06:00:00.000Z',
  derivedStatus: 'draft',
  documentId: null,
  expectedDeliveryDate: null,
  id: '00000000-0000-4000-8000-000000000024',
  jobs: [],
  lines: [
    {
      partId,
      partCode: part.code,
      partName: part.name,
      quantity: 5,
      receivedQuantity: 0,
      standardPurchaseLengthMm: null,
      unitOfMeasure: 'piece',
      unitPrice: 10,
    },
  ],
  sentAt: null,
  status: 'draft',
  supplier: { address: null, companyName: 'Bolt & Nut', contactPerson: null, email: null, id: supplierId, phone: null },
  supplierId,
  updatedAt: '2026-09-05T06:00:00.000Z',
});

const cleanups: Array<() => void> = [];
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  act(() => toast.dismiss());
  for (const cleanup of cleanups.splice(0).reverse()) cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

it.each(['Approve', 'Preview PDF'])(
  '%s waits for the edited Draft, including a save already in flight',
  async (label) => {
    const save = deferred<PurchaseOrderView>();
    const saveDraft = vi.fn(() => save.promise);
    const approve = vi.fn(() => purchaseOrder);
    const preview = stubPreview();
    const requestedAction = label === 'Approve' ? approve : preview;
    const container = await mount({ 'purchaseOrders.saveDraft': saveDraft, 'purchaseOrders.approve': approve });

    await editQuantity(container, '6');
    expect(saveDraft).toHaveBeenCalledWith(
      expect.objectContaining({
        lines: [{ partId, quantity: 6, unitPrice: 10 }],
      }),
    );
    await click(container, label);
    expect(requestedAction).not.toHaveBeenCalled();
    expect(button(container, label).disabled).toBe(true);

    await act(async () => save.resolve(purchaseOrder));
    await act(async () => {
      await vi.waitFor(() => expect(requestedAction).toHaveBeenCalledTimes(1));
    });
    if (label === 'Preview PDF') {
      await act(async () => {
        await vi.waitFor(() => expect(document.querySelector('iframe[title="PO-00024.pdf"]')).not.toBeNull());
      });
    } else {
      expect(approve).toHaveBeenCalledWith({ id: purchaseOrder.id });
    }
  },
);

it.each(['Approve', 'Preview PDF'])('%s refuses an invalid Draft', async (label) => {
  const saveDraft = vi.fn(() => purchaseOrder);
  const approve = vi.fn(() => purchaseOrder);
  const preview = stubPreview();
  const container = await mount({ 'purchaseOrders.saveDraft': saveDraft, 'purchaseOrders.approve': approve });

  await editQuantity(container, '0');
  await click(container, label);

  expect(container.textContent).toContain('Quantity must be greater than zero');
  expect(saveDraft).not.toHaveBeenCalled();
  expect(approve).not.toHaveBeenCalled();
  expect(preview).not.toHaveBeenCalled();
  expect(button(container, label).disabled).toBe(false);
});

it.each(['Approve', 'Preview PDF'])('%s blocks on a failed save and works after retrying', async (label) => {
  const save = deferred<PurchaseOrderView>();
  const saveDraft = vi.fn(() => save.promise);
  const approve = vi.fn(() => purchaseOrder);
  const preview = stubPreview();
  const requestedAction = label === 'Approve' ? approve : preview;
  const container = await mount({ 'purchaseOrders.saveDraft': saveDraft, 'purchaseOrders.approve': approve });

  await editQuantity(container, '6');
  await click(container, label);
  await act(async () => {
    save.reject(new Error('The Purchase Order could not be saved.'));
    await vi.waitFor(() => expect(button(container, label).disabled).toBe(false));
  });
  expect(document.body.textContent).toContain('The Purchase Order could not be saved.');
  expect(requestedAction).not.toHaveBeenCalled();

  saveDraft.mockImplementation(async () => purchaseOrder);
  await click(container, label);
  await act(async () => {
    await vi.waitFor(() => expect(requestedAction).toHaveBeenCalledTimes(1));
  });
  expect(saveDraft).toHaveBeenLastCalledWith(
    expect.objectContaining({ lines: [{ partId, quantity: 6, unitPrice: 10 }] }),
  );
});

const lifecycleActions = [
  { label: 'Approve', path: 'approve', status: 'draft' },
  { label: 'Revert to draft', path: 'revertToDraft', status: 'approved' },
  { label: 'Mark sent', path: 'markSent', status: 'approved' },
  { label: 'Cancel', path: 'cancel', status: 'draft' },
  { label: 'Close short', path: 'closeShort', status: 'sent' },
] as const;

it.each(lifecycleActions)(
  '$label reports a server refusal and releases its controls',
  async ({ label, path, status }) => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    const container = await mount(
      {
        [`purchaseOrders.${path}`]: () => {
          throw new Error('This Purchase Order cannot take that action.');
        },
      },
      orderInStatus(status),
    );

    await click(container, label);
    await act(async () => {
      await vi.waitFor(() =>
        expect(document.body.textContent).toContain('This Purchase Order cannot take that action.'),
      );
    });
    expect(button(container, label).disabled).toBe(false);
  },
);

it.each(lifecycleActions.filter(({ path }) => ['cancel', 'closeShort', 'revertToDraft'].includes(path)))(
  '$label respects a dismissed confirmation',
  async ({ label, path, status }) => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    const transition = vi.fn(() => purchaseOrder);
    const container = await mount({ [`purchaseOrders.${path}`]: transition }, orderInStatus(status));
    await click(container, label);
    expect(transition).not.toHaveBeenCalled();
  },
);

it('keeps save coordination alive when the Draft is hidden by the Audit tab', async () => {
  const save = deferred<PurchaseOrderView>();
  const approve = vi.fn(() => purchaseOrder);
  const container = await mount({ 'purchaseOrders.saveDraft': () => save.promise, 'purchaseOrders.approve': approve });
  await editQuantity(container, '6');
  await click(container, 'Audit');
  expect(container.querySelector('input[name="lines[0].quantity"]')).toBeNull();
  await click(container, 'Approve');
  expect(approve).not.toHaveBeenCalled();
  await act(async () => {
    save.resolve(purchaseOrder);
    await vi.waitFor(() => expect(approve).toHaveBeenCalledTimes(1));
  });
});

it.each([
  { denied: 'equipment_inventory_cost:read', draft: false, approve: true },
  { denied: 'equipment_purchase_order:create', draft: false, approve: true },
  { denied: 'equipment_purchase_order:approve', draft: true, approve: false },
] as const)(
  'keeps the $denied permission independent from order-state verdicts',
  async ({ denied, draft, approve }) => {
    const access = buyerAccess();
    const container = await mount({
      'auth.access': () => ({
        ...access,
        permissions: access.permissions.filter((permission) => permission !== denied),
      }),
    });
    expect(container.querySelector('form') !== null).toBe(draft);
    expect([...container.querySelectorAll('button')].some((item) => item.textContent?.trim() === 'Approve')).toBe(
      approve,
    );
  },
);

function orderInStatus(status: PurchaseOrderView['status']): PurchaseOrderView {
  return {
    ...purchaseOrder,
    status,
    actions: derivePurchaseOrderActions({
      closedShortAt: null,
      hasAnyMovement: status === 'sent',
      isEmpty: false,
      progress: 'partially-received',
      status,
    }),
  };
}

function stubPreview() {
  // jsdom has no object URLs; the real preview sheet still owns fetching and rendering its iframe.
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL() {
        return 'blob:purchase-order-preview';
      }
      static revokeObjectURL() {}
    },
  );
  return vi
    .spyOn(globalThis, 'fetch')
    .mockResolvedValue(new Response(new Blob(['%PDF-1.7'], { type: 'application/pdf' })));
}

function buyerAccess() {
  return createUserAccessSummary({ equipmentRole: 'admin', contractingRole: null, userId: 'buyer' });
}

type RequestHandler = (input: unknown) => unknown | Promise<unknown>;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}

async function mount(overrides: Record<string, RequestHandler> = {}, order = purchaseOrder) {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false }, mutations: { retry: false } } });
  const page = <T,>(items: T[]) => ({ items, nextCursor: null, total: items.length });
  const handlers: Record<string, RequestHandler> = {
    'auth.access': () => createUserAccessSummary({ equipmentRole: 'admin', contractingRole: null, userId: 'buyer' }),
    'parts.list': () => page([part]),
    'suppliers.list': () => page([purchaseOrder.supplier]),
    'jobs.list': () => page([]),
    'inventory.stockOnHand': () => page([]),
    'purchaseOrders.saveDraft': (input) => ({ ...purchaseOrder, ...PurchaseOrderSaveDraftInput.parse(input) }),
    ...overrides,
  };
  const trpcClient = createTRPCClient<AppRouter>({
    links: [
      httpLink({
        url: 'http://purchase-order.test/trpc',
        fetch: async (input, init) => {
          const url = new URL(String(input));
          const path = url.pathname.slice('/trpc/'.length);
          const handler = handlers[path];
          if (!handler) throw new Error(`Unexpected request: ${path}`);
          const args = JSON.parse(
            typeof init?.body === 'string' ? init.body : (url.searchParams.get('input') ?? 'null'),
          );
          try {
            const data = await handler(args);
            return Response.json({ result: { data } });
          } catch (error) {
            return Response.json(
              {
                error: {
                  code: -32600,
                  message: error instanceof Error ? error.message : 'Request failed',
                  data: { code: 'BAD_REQUEST', httpStatus: 400, appCode: 'purchase_order.line_not_priced' },
                },
              },
              { status: 400 },
            );
          }
        },
      }),
    ],
  });
  await queryClient.fetchQuery(createTrpcOptions(queryClient, trpcClient).auth.access.queryOptions());
  const route = createRootRoute({
    component: () => (
      <PurchaseOrderEditing purchaseOrder={order}>
        {({ actions, draft }) => (
          <>
            {actions}
            <Tabs defaultValue="details">
              <TabsList>
                <TabsTrigger value="details">Details</TabsTrigger>
                <TabsTrigger value="audit">Audit</TabsTrigger>
              </TabsList>
              <TabsContent value="details">{draft ?? 'Read-only Purchase Order'}</TabsContent>
              <TabsContent value="audit">Audit history</TabsContent>
            </Tabs>
            <Toaster theme="light" />
          </>
        )}
      </PurchaseOrderEditing>
    ),
  });
  const router = createRouter({
    routeTree: route,
    history: createMemoryHistory({ initialEntries: ['/'] }),
    scrollRestoration: false,
  });
  vi.spyOn(window, 'scrollTo').mockImplementation(() => undefined);
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  cleanups.push(() => {
    act(() => root.unmount());
    container.remove();
    queryClient.clear();
  });
  await act(async () => {
    await router.load();
    root.render(
      <QueryClientProvider client={queryClient}>
        <TRPCProvider queryClient={queryClient} trpcClient={trpcClient}>
          <RouterProvider router={router} />
        </TRPCProvider>
      </QueryClientProvider>,
    );
  });
  await act(async () => {
    await vi.waitFor(() => expect(queryClient.isFetching()).toBe(0));
  });
  return container;
}

async function editQuantity(container: HTMLElement, value: string) {
  const input = container.querySelector<HTMLInputElement>('input[name="lines[0].quantity"]');
  if (!input) throw new Error('Quantity input did not render');
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
    input.blur();
  });
}

function button(container: HTMLElement, label: string) {
  const result = [...container.querySelectorAll('button')].find((item) => item.textContent?.trim() === label);
  if (!result) throw new Error(`${label} button did not render`);
  return result;
}

async function click(container: HTMLElement, label: string) {
  await act(async () => button(container, label).click());
}
