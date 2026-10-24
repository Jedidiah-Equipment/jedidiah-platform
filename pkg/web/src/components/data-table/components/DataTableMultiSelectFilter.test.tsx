// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';

import { DataTable } from '../DataTable.js';
import { type DataTableColumnDef, useDataTable } from '../features.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { machineId: string };

const columns: DataTableColumnDef<Row>[] = [
  {
    id: 'machine',
    accessorFn: (row) => row.machineId,
    header: 'Machine',
    enableColumnFilter: true,
    meta: {
      filterVariant: 'multi-select',
      filterOptions: [
        { value: '07b7ad4c-e1ae-46a2-b264-0b14556bc383', label: 'BEL315-1' },
        { value: 'f536ea9d-3ca4-42b6-bb74-133887f8acee', label: 'KOL220-2' },
      ],
    },
  },
];

let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
});

function MachineTable() {
  const table = useDataTable({ columns, data: [{ machineId: '07b7ad4c-e1ae-46a2-b264-0b14556bc383' }] });
  return <DataTable emptyMessage="None." paginationMode="complete" table={table} total={1} />;
}

it('searches a multi-select filter by the labels it shows, not the ids behind them', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<MachineTable />));

  await act(async () => document.querySelector<HTMLElement>('[aria-label="Filter Machine"]')?.click());
  const input = document.querySelector<HTMLInputElement>('input[placeholder="Select..."]');
  if (!input) throw new Error('The Machine filter did not open');
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'KOL');
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });

  const options = [...document.querySelectorAll('[role="option"]')].map((option) => option.textContent);
  expect(options).toEqual(['KOL220-2']);
});
