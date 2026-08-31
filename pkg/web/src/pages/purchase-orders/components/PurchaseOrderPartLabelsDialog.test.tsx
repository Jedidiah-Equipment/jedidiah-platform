// @vitest-environment jsdom

import type { PurchaseOrderLineView, UUID } from '@pkg/schema';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { PurchaseOrderPartLabelsDialog } from './PurchaseOrderPartLabelsDialog.js';

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
    expect(findPdfLink().href).toContain(`ids=${RECEIVED_PART_ID}`);
    expect(findPdfLink().href).toContain('copies=2');
  });

  it('excludes zero-count Parts and opens one PDF for the remaining edited counts', async () => {
    const trigger = await renderDialog([
      line(RECEIVED_PART_ID, 'P-100', 'Main bearing', 2),
      line(OTHER_RECEIVED_PART_ID, 'T-100', 'Hydraulic tube', 3),
    ]);

    await act(async () => trigger.click());
    await setCount('P-100', '0');
    await setCount('T-100', '4');

    const href = findPdfLink().href;
    expect(href).not.toContain(RECEIVED_PART_ID);
    expect(href).toContain(`ids=${OTHER_RECEIVED_PART_ID}`);
    expect(href).toContain('copies=4');
  });

  it('does not offer the action when no stock has been received', async () => {
    const container = await mount(
      <PurchaseOrderPartLabelsDialog lines={[line(UNRECEIVED_PART_ID, 'P-200', 'Unused bearing', 0)]} />,
    );

    expect(container.textContent).not.toContain('Print Part labels');
  });
});

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
  const container = document.createElement('div');
  document.body.append(container);
  containers.push(container);
  const root = createRoot(container);
  roots.push(root);
  await act(async () => root.render(node));
  return container;
}

function findCountInput(partCode: string): HTMLInputElement {
  const input = document.querySelector<HTMLInputElement>(`input[aria-label="Labels for ${partCode}"]`);
  if (!input) throw new Error(`Label count input missing for ${partCode}`);
  return input;
}

function findPdfLink(): HTMLAnchorElement {
  const link = [...document.querySelectorAll<HTMLAnchorElement>('a')].find((candidate) =>
    candidate.textContent?.includes('Open printable PDF'),
  );
  if (!link) throw new Error('Open printable PDF link missing');
  return link;
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

function line(partId: UUID, partCode: string, partName: string, receivedQuantity: number): PurchaseOrderLineView {
  return {
    partCode,
    partId,
    partName,
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
