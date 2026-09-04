// @vitest-environment jsdom

import type { UUID } from '@pkg/schema';
import type { PartLabelCopySelection, PurchaseOrderLineView } from '@pkg/schema/equipment';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { fetchPartLabelsBlob } from '@/equipment/pages/parts/part-label.js';
import { PurchaseOrderPartLabelsDialog } from './PurchaseOrderPartLabelsDialog.js';

vi.mock('@/equipment/pages/parts/part-label.js', () => ({
  fetchPartLabelsBlob: vi.fn(async () => new Blob(['%PDF-label'], { type: 'application/pdf' })),
}));
// Reads the client config at import time, which jsdom only holds once a test has stubbed it.
vi.mock('@/hooks/use-api-mutation-error-toast.js', () => ({ useApiMutationErrorToast: () => vi.fn() }));

const RECEIVED_PART_ID = '22222222-2222-4222-8222-222222222222' as UUID;
const OTHER_RECEIVED_PART_ID = '33333333-3333-4333-8333-333333333333' as UUID;
const UNRECEIVED_PART_ID = '44444444-4444-4444-8444-444444444444' as UUID;

const roots: Array<ReturnType<typeof createRoot>> = [];
const containers: HTMLDivElement[] = [];

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  for (const root of roots) act(() => root.unmount());
  for (const container of containers) container.remove();
  roots.length = 0;
  containers.length = 0;
  delete (window as unknown as { __APP_CONFIG__?: unknown }).__APP_CONFIG__;
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

describe('PurchaseOrderPartLabelsDialog', () => {
  it('lists only received Parts and defaults label counts to their total received quantities', async () => {
    const trigger = await renderDialog([
      line(RECEIVED_PART_ID, 'P-100', 'Main bearing', 2),
      line(UNRECEIVED_PART_ID, 'P-200', 'Unused bearing', 0),
    ]);

    await act(async () => trigger.click());

    expect(document.body.textContent).toContain('P-100');
    expect(document.body.textContent).toContain('Main bearing');
    expect(document.body.textContent).not.toContain('P-200');
    expect(document.body.textContent).not.toContain('Unused bearing');
    expect(findCountInput('P-100').value).toBe('2');
    expect(document.querySelector<HTMLAnchorElement>('a[aria-label="How to print Part labels"]')?.href).toBe(
      'http://localhost:7006/inventory/print-part-labels',
    );
    await clickPdfButton();
    expectPdfRequestedWith([{ copies: 2, partId: RECEIVED_PART_ID }]);
  });

  it('excludes zero-count Parts and requests one PDF for the remaining edited counts', async () => {
    const trigger = await renderDialog([
      line(RECEIVED_PART_ID, 'P-100', 'Main bearing', 2),
      line(OTHER_RECEIVED_PART_ID, 'T-100', 'Hydraulic tube', 3),
    ]);

    await act(async () => trigger.click());
    await setCount('P-100', '0');
    await setCount('T-100', '4');

    await clickPdfButton();
    expectPdfRequestedWith([{ copies: 4, partId: OTHER_RECEIVED_PART_ID }]);
  });

  it('starts fractional received quantities at the next printable whole-label count', async () => {
    const trigger = await renderDialog([
      line(RECEIVED_PART_ID, 'W-100', 'Welding wire', 12.5),
      line(OTHER_RECEIVED_PART_ID, 'P-100', 'Main bearing', 2),
    ]);

    await act(async () => trigger.click());

    expect(findCountInput('W-100').value).toBe('13');
    await clickPdfButton();
    expectPdfRequestedWith([
      { copies: 13, partId: RECEIVED_PART_ID },
      { copies: 2, partId: OTHER_RECEIVED_PART_ID },
    ]);
  });

  it('excludes stock that was returned to the Supplier even when the order line stays fulfilled', async () => {
    const trigger = await renderDialog([
      line(RECEIVED_PART_ID, 'P-100', 'Misordered bearing', 10, 0),
      line(OTHER_RECEIVED_PART_ID, 'T-100', 'Hydraulic tube', 2),
    ]);

    await act(async () => trigger.click());

    expect(document.body.textContent).not.toContain('Misordered bearing');
    expect(document.body.textContent).toContain('Hydraulic tube');
    await clickPdfButton();
    expectPdfRequestedWith([{ copies: 2, partId: OTHER_RECEIVED_PART_ID }]);
  });

  it('does not offer the action when no stock has been received', async () => {
    const container = await mount(
      <PurchaseOrderPartLabelsDialog lines={[line(UNRECEIVED_PART_ID, 'P-200', 'Unused bearing', 0)]} />,
    );

    expect(container.textContent).not.toContain('Print Part labels');
  });
});

function expectPdfRequestedWith(copies: PartLabelCopySelection[]): void {
  expect(fetchPartLabelsBlob).toHaveBeenCalledWith({
    selection: { copies, selection: 'copies' },
    signal: expect.any(AbortSignal),
  });
}

async function renderDialog(lines: PurchaseOrderLineView[]): Promise<HTMLButtonElement> {
  stubClientConfig();
  const container = await mount(<PurchaseOrderPartLabelsDialog lines={lines} />);
  const trigger = [...container.querySelectorAll('button')].find((button) =>
    button.textContent?.includes('Print Part labels'),
  );
  if (!trigger) throw new Error('Print Part labels trigger missing');
  return trigger;
}

async function mount(node: React.ReactNode): Promise<HTMLDivElement> {
  vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:part-labels');
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => undefined);
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  await act(async () => root.render(<QueryClientProvider client={client}>{node}</QueryClientProvider>));
  return container;
}

function findCountInput(partCode: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="Labels for ${partCode}"]`);
  if (!input) throw new Error(`Label count input missing for ${partCode}`);
  return input;
}

async function clickPdfButton(): Promise<void> {
  const button = [...document.querySelectorAll<HTMLButtonElement>('button')].find((candidate) =>
    candidate.textContent?.includes('Open printable PDF'),
  );
  if (!button) throw new Error('Open printable PDF button missing');
  await act(async () => button.click());
}

async function setCount(partCode: string, value: string): Promise<void> {
  const input = findCountInput(partCode);
  await act(async () => {
    const valueSetter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    if (!valueSetter) throw new Error('HTMLInputElement.value setter is unavailable');
    valueSetter.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

function line(
  partId: UUID,
  partCode: string,
  partName: string,
  receivedQuantity: number,
  heldQuantity = receivedQuantity,
): PurchaseOrderLineView {
  return {
    partCode,
    partId,
    partName,
    receiptBuckets: heldQuantity === 0 ? [] : [{ lengthMm: null, outstandingReceivedQuantity: heldQuantity }],
    receivedQuantity,
  } as PurchaseOrderLineView;
}

function stubClientConfig(): void {
  (window as unknown as { __APP_CONFIG__: unknown }).__APP_CONFIG__ = {
    appBaseUrl: 'http://localhost:7101',
    appEnv: 'development',
    apiBaseUrl: 'http://localhost:7102',
    authBaseUrl: 'http://localhost:7102/api/auth',
    docsBaseUrl: 'http://localhost:7006',
  };
}
