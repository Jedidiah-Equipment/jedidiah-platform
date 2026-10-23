import type { Machine, ServiceRecord, ServiceRecordStatus, ServiceRecordTableInput } from '@pkg/schema/contracting';
import { serviceRecordStatuses } from '@pkg/schema/contracting';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { isPickedExactly, readMultiSelectFilter, togglePick } from '@/components/data-table/column-filter-values.js';

export const MACHINE_COLUMN_ID = 'machine';
export const MECHANIC_COLUMN_ID = 'mechanic';
export const START_COLUMN_ID = 'startDate';
export const STATUS_COLUMN_ID = 'status';

/** A Services table row: a Machine Due for Service pinned on top, or one Service Record. */
export type ServicesTableRow = { kind: 'due'; machine: Machine } | { kind: 'record'; record: ServiceRecord };

export const createDueRow = (machine: Machine): ServicesTableRow => ({ kind: 'due', machine });
export const createRecordRow = (record: ServiceRecord): ServicesTableRow => ({ kind: 'record', record });

/** The Machine either kind of row is about; a row click opens it. */
export const rowMachine = (row: ServicesTableRow) =>
  row.kind === 'due'
    ? { id: row.machine.id, code: row.machine.code }
    : { id: row.record.machineId, code: row.record.machineCode };

/** Everything the Services table's column filters ask of the Service Record list. */
export function servicesTableFilters(columnFilters: ColumnFiltersState) {
  return {
    statuses: listedServiceStatuses(columnFilters),
    machineIds: readMultiSelectFilter(columnFilters, MACHINE_COLUMN_ID),
    mechanicUserIds: readMultiSelectFilter(columnFilters, MECHANIC_COLUMN_ID),
  } satisfies Partial<ServiceRecordTableInput>;
}

/** The statuses picked in the Status filter; none picked lists every Service Record. */
export const listedServiceStatuses = (columnFilters: ColumnFiltersState): ServiceRecordStatus[] =>
  serviceRecordStatuses.filter((status) => readMultiSelectFilter(columnFilters, STATUS_COLUMN_ID).includes(status));

/** Exactly these statuses are picked; no status at all is All. */
export const isPickedServiceStatuses = (columnFilters: ColumnFiltersState, statuses: readonly ServiceRecordStatus[]) =>
  isPickedExactly(columnFilters, STATUS_COLUMN_ID, statuses);

/** Picks exactly these statuses; pressing again clears the pick. */
export const toggleServiceStatuses = (columnFilters: ColumnFiltersState, statuses: readonly ServiceRecordStatus[]) =>
  togglePick(columnFilters, STATUS_COLUMN_ID, statuses);

/** All: drops the status pick, every other filter kept. */
export const clearServiceStatuses = (columnFilters: ColumnFiltersState): ColumnFiltersState =>
  columnFilters.filter((filter) => filter.id !== STATUS_COLUMN_ID);
