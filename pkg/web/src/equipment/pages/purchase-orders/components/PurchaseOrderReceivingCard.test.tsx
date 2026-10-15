// @vitest-environment jsdom

import type { PurchaseOrderView } from '@pkg/schema/equipment';
import { act } from 'react';
import { createRoot } from 'react-dom/client';
import { afterEach, expect, it, vi } from 'vitest';

vi.mock('@/equipment/pages/parts/part-label.js', () => ({ partLabelUrl: (partId: string) => `/labels/${partId}` }));
vi.mock('./PurchaseOrderArrivalDialog.js', () => ({
  PurchaseOrderArrivalDialog: ({ line }: { line: { id: string } }) => <p>{`Arrival for ${line.id}`}</p>,
}));
vi.mock('./PurchaseOrderReceiveDialog.js', () => ({
  PurchaseOrderReceiveDialog: ({ line }: { line: { id: string } }) => <p>{`Receipt for ${line.id}`}</p>,
}));

import { PurchaseOrderReceivingCard } from './PurchaseOrderReceivingCard.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

afterEach(() => {
  document.body.replaceChildren();
});

const PART_LINE_ID = '00000000-0000-4000-8000-000000000002';
const CUSTOM_LINE_ID = '00000000-0000-4000-8000-000000000003';
const RECEIVED_PART_LINE_ID = '00000000-0000-4000-8000-000000000004';
const purchaseOrder = {
  id: '00000000-0000-4000-8000-000000000001',
  lines: [
    {
      description: 'Hydraulic hose',
      id: PART_LINE_ID,
      kind: 'part',
      partCode: 'P-100',
      partId: '00000000-0000-4000-8000-000000000010',
      quantity: 4,
      receivedQuantity: 0,
    },
    { description: 'Packing tape', id: CUSTOM_LINE_ID, kind: 'custom', quantity: 5, receivedQuantity: 0 },
    {
      description: 'Grease nipple',
      id: RECEIVED_PART_LINE_ID,
      kind: 'part',
      partCode: 'P-200',
      partId: '00000000-0000-4000-8000-000000000011',
      quantity: 10,
      receivedQuantity: 3,
    },
  ],
} as PurchaseOrderView;

async function render() {
  const container = document.createElement('div');
  document.body.append(container);
  const root = createRoot(container);
  await act(async () => root.render(<PurchaseOrderReceivingCard canReadCosts purchaseOrder={purchaseOrder} />));
  return { container, root };
}

function rowFor(container: HTMLElement, text: string) {
  const row = [...container.querySelectorAll('tr')].find((candidate) => candidate.textContent?.includes(text));
  if (!row) throw new Error(`Row for ${text} missing`);
  return row;
}

async function clickReceive(row: HTMLElement) {
  const button = [...row.querySelectorAll('button')].find((candidate) => candidate.textContent?.includes('Receive'));
  if (!button) throw new Error('Receive action missing');
  await act(async () => button.click());
}

it('lists every line with what it still owes and a label button only once stock has landed', async () => {
  const { container, root } = await render();

  const hoseRow = rowFor(container, 'P-100');
  expect(hoseRow.textContent).toContain('0 / 4');
  expect(hoseRow.textContent).not.toContain('Print label');
  const greaseRow = rowFor(container, 'P-200');
  expect(greaseRow.textContent).toContain('3 / 10');
  expect(greaseRow.textContent).toContain('7');
  expect(greaseRow.textContent).toContain('Print label');
  expect(rowFor(container, 'Packing tape').textContent).toContain('0 / 5');
  await act(async () => root.unmount());
});

it('hands a Part Line to the Receive dialog and a Custom Line to the Arrival dialog', async () => {
  const { container, root } = await render();
  expect(container.textContent).not.toContain('Receipt for');

  await clickReceive(rowFor(container, 'P-100'));
  expect(container.textContent).toContain(`Receipt for ${PART_LINE_ID}`);

  await clickReceive(rowFor(container, 'Packing tape'));
  expect(container.textContent).toContain(`Arrival for ${CUSTOM_LINE_ID}`);
  expect(container.textContent).not.toContain('Receipt for');
  await act(async () => root.unmount());
});
