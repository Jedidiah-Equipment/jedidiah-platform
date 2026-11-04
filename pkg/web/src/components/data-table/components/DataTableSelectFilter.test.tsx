// @vitest-environment jsdom

import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, expect, it } from 'vitest';

import { DataTable } from '../DataTable.js';
import { type DataTableColumnDef, useDataTable } from '../features.js';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Row = { driverId: string; name: string };

const drivers = [
  { value: 'driver-andile', label: 'Andile Nkosi' },
  { value: 'driver-sandile', label: 'Sandile Khumalo' },
  { value: 'driver-zola', label: 'Zola Dube' },
];

const columns: DataTableColumnDef<Row>[] = [
  {
    id: 'driver',
    accessorFn: (row) => row.driverId,
    header: 'Driver',
    enableColumnFilter: true,
    cell: ({ row }) => row.original.name,
    meta: { filterVariant: 'select', filterOptions: drivers },
  },
];

let root: Root | undefined;

afterEach(async () => {
  await act(async () => root?.unmount());
  document.body.replaceChildren();
});

function DriverTable() {
  const table = useDataTable({
    columns,
    data: drivers.map((driver) => ({ driverId: driver.value, name: driver.label })),
  });
  return <DataTable emptyMessage="None." paginationMode="complete" table={table} total={drivers.length} />;
}

it('searches a select filter by the labels it shows, and picking one filters the rows', async () => {
  const container = document.createElement('div');
  document.body.append(container);
  root = createRoot(container);
  await act(async () => root?.render(<DriverTable />));

  await act(async () => document.querySelector<HTMLElement>('[aria-label="Filter Driver"]')?.click());
  const input = document.querySelector<HTMLInputElement>('[data-slot="popover-content"] input');
  if (!input) throw new Error('The Driver filter did not open');
  expect(input.getAttribute('aria-label')).toBe('Filter Driver');
  await act(async () => {
    input.focus();
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set?.call(input, 'andile');
    input.dispatchEvent(new InputEvent('input', { bubbles: true, inputType: 'insertText' }));
  });

  const options = () => [...document.querySelectorAll<HTMLElement>('[role="option"]')];
  expect(options().map((option) => option.textContent)).toEqual(['Andile Nkosi', 'Sandile Khumalo']);

  await act(async () => options()[1]?.click());
  const cells = [...container.querySelectorAll('tbody td')].map((cell) => cell.textContent);
  expect(cells).toEqual(['Sandile Khumalo']);
});
