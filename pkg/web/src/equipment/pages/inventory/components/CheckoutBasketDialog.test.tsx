/** @vitest-environment jsdom */

import type { StockOnHandRow } from '@pkg/schema/equipment';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

vi.hoisted(() => {
  Object.assign(window, {
    __APP_CONFIG__: {
      appBaseUrl: 'http://checkout-basket.test',
      appEnv: 'test',
      apiBaseUrl: 'http://checkout-basket.test',
      authBaseUrl: 'http://checkout-basket.test/api/auth',
    },
  });
});

const postBasket = vi.fn(async () => ({ lines: [{ movement: {}, warnings: [] }], warnings: [] }));
const invalidateInventory = vi.fn(async () => undefined);
const acknowledge = vi.fn();
const reconcile = vi.fn();

vi.mock('@/lib/trpc.js', () => ({
  useTRPC: () => ({
    inventory: {
      jobStock: {
        queryOptions: (input: unknown, options: Record<string, unknown>) => ({
          queryFn: async () => ({ items: [], job: {} }),
          queryKey: ['jobStock', input],
          ...options,
        }),
      },
      postCheckoutBasket: {
        mutationOptions: (options: Record<string, unknown>) => ({ mutationFn: postBasket, ...options }),
      },
      recipientOptions: {
        queryOptions: (input: unknown, options: Record<string, unknown>) => ({
          queryFn: async () => ({ items: [{ id: 'recipient', name: 'Connor' }], total: 1 }),
          queryKey: ['recipientOptions', input],
          ...options,
        }),
      },
    },
  }),
}));
vi.mock('@/lib/auth-client.js', () => ({
  authClient: { useSession: () => ({ data: { user: { id: 'recipient', name: 'Stores Operator' } } }) },
}));
vi.mock('@/equipment/hooks/options/index.js', () => ({
  useInventoryJobPicker: () => ({ isLoading: false, items: [] }),
}));
vi.mock('@/equipment/components/job-picker/index.js', () => ({
  JobPicker: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  JobPickerTrigger: ({ id, placeholder }: { id: string; placeholder: string }) => (
    <button id={id} type="button">
      {placeholder}
    </button>
  ),
}));
vi.mock('@/equipment/hooks/use-query-invalidation.js', () => ({
  useQueryInvalidation: () => ({ invalidateInventory }),
}));
vi.mock('@/equipment/hooks/use-movement-warnings.js', () => ({
  useMovementWarnings: () => ({ acknowledge, reconcile }),
}));
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));

import { CheckoutBasketDialog } from './CheckoutBasketDialog.js';
import type { StockPartOption } from './types.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const piece: StockPartOption = {
  isInternallyFabricated: false,
  partCode: 'HYD-0052',
  partId: '00000000-0000-4000-8000-000000000001',
  partName: 'Hydraulic fitting',
  standardPurchaseLengthMm: null,
  unitOfMeasure: 'piece',
};
const linear: StockPartOption = {
  isInternallyFabricated: false,
  partCode: 'CH-6000',
  partId: '00000000-0000-4000-8000-000000000002',
  partName: 'Channel',
  standardPurchaseLengthMm: 6_000,
  unitOfMeasure: 'mm',
};
const parts = [piece, linear];
const items: StockOnHandRow[] = parts.map((part) => ({
  asOfLastCount: null,
  averageUnitCost: null,
  buckets: [{ lengthMm: part.unitOfMeasure === 'mm' ? 6_000 : null, quantity: 10, totalValue: null }],
  committed: 0,
  estimatedOnHand: null,
  free: 10,
  isInternallyFabricated: false,
  onOrder: 0,
  partCode: part.partCode,
  partId: part.partId,
  partName: part.partName,
  quantity: 10,
  standardPurchaseLengthMm: part.standardPurchaseLengthMm,
  stockTrackingMode: 'perpetual' as const,
  totalValue: null,
  unitOfMeasure: part.unitOfMeasure,
}));

const roots: Root[] = [];
afterEach(async () => {
  postBasket.mockClear();
  invalidateInventory.mockClear();
  acknowledge.mockClear();
  reconcile.mockClear();
  vi.restoreAllMocks();
  await act(async () => {
    for (const root of roots.splice(0)) root.unmount();
  });
  document.body.replaceChildren();
});

async function mount({
  fixed = true,
  onOpenChange = vi.fn<(open: boolean) => void>(),
  stockItems = items,
}: {
  fixed?: boolean;
  onOpenChange?: (open: boolean) => void;
  stockItems?: readonly StockOnHandRow[];
} = {}) {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  roots.push(root);
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });

  await act(async () => {
    root.render(
      <QueryClientProvider client={queryClient}>
        <CheckoutBasketDialog
          {...(fixed ? { fixedJob: { code: 'JOB-00001', id: '00000000-0000-4000-8000-000000000009' } } : {})}
          items={stockItems}
          onOpenChange={onOpenChange}
          open
          parts={parts}
        />
      </QueryClientProvider>,
    );
  });
  return { container, onOpenChange };
}

async function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(
      input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value',
    )?.set?.call(input, value);
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });
}

async function press(input: HTMLElement, key: string) {
  await act(async () => {
    input.dispatchEvent(new KeyboardEvent('keydown', { bubbles: true, cancelable: true, key }));
  });
}

async function scan(code: string) {
  const input = document.querySelector<HTMLInputElement>('#checkout-basket-part');
  if (!input) throw new Error('Part scanner input missing');
  await type(input, code);
  await press(input, 'Enter');
  return input;
}

describe('CheckoutBasketDialog', () => {
  it('scans repeat Parts into one summed line and submits the fixed Job Basket', async () => {
    await mount();
    expect(document.body.textContent).not.toContain('Without a Job');

    await scan('HYD-0052');
    const quantity = document.querySelector<HTMLInputElement>('#checkout-basket-quantity');
    if (!quantity) throw new Error('Quantity input missing');
    expect(document.activeElement).toBe(quantity);
    await press(quantity, 'Enter');
    await scan('HYD-0052');
    await type(quantity, '4');
    await press(quantity, 'Enter');

    const lineQuantity = document.querySelector<HTMLInputElement>('[aria-label="Quantity for HYD-0052"]');
    expect(lineQuantity?.value).toBe('5');
    const submit = [...document.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Check out 1 line'),
    );
    expect(submit?.disabled).toBe(false);
    await act(async () => submit?.click());

    await vi.waitFor(() =>
      expect(postBasket).toHaveBeenCalledWith(
        {
          jobId: '00000000-0000-4000-8000-000000000009',
          lines: [{ lengthMm: null, partId: piece.partId, quantity: 5 }],
        },
        expect.anything(),
      ),
    );
  });

  it('defaults a linear length, previews a short rack, and keeps lines when close is cancelled', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    const shortItems = items.map((item) =>
      item.partId === linear.partId
        ? { ...item, buckets: item.buckets.map((bucket) => ({ ...bucket, quantity: 0 })) }
        : item,
    );
    const { onOpenChange } = await mount({ stockItems: shortItems });

    await scan('CH-6000');
    const quantity = document.querySelector<HTMLInputElement>('#checkout-basket-quantity');
    if (!quantity) throw new Error('Quantity input missing');
    await press(quantity, 'Enter');

    expect(document.body.textContent).toContain('6000');
    expect(document.body.textContent).toContain('Line 1 · CH-6000: This draw will take stock on hand negative');
    expect(document.body.textContent).toContain('Check out anyway');
    const cancel = [...document.querySelectorAll('button')].find((button) => button.textContent === 'Cancel');
    await act(async () => cancel?.click());

    expect(confirm).toHaveBeenCalledWith('Discard 1 unrecorded line?');
    expect(onOpenChange).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('CH-6000 · Channel');
  });

  it('posts a person and Purpose on every Without-a-Job line', async () => {
    await mount({ fixed: false });
    const tab = [...document.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Without a Job'),
    );
    await act(async () => tab?.click());
    const purpose = document.querySelector<HTMLTextAreaElement>('textarea[name="note"]');
    if (!purpose) throw new Error('Purpose field missing');
    await type(purpose, 'repair factory drill');
    await scan('HYD-0052');
    const quantity = document.querySelector<HTMLInputElement>('#checkout-basket-quantity');
    if (!quantity) throw new Error('Quantity input missing');
    await press(quantity, 'Enter');
    const submit = [...document.querySelectorAll('button')].find((button) =>
      button.textContent?.includes('Check out 1 line'),
    );
    await act(async () => submit?.click());

    await vi.waitFor(() =>
      expect(postBasket).toHaveBeenCalledWith(
        {
          lines: [{ lengthMm: null, partId: piece.partId, quantity: 1 }],
          note: 'repair factory drill',
          recipientUserId: 'recipient',
        },
        expect.anything(),
      ),
    );
  });
});
