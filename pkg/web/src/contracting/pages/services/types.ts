import type { BadgeColorClassNames } from '@pkg/domain';
import { machineServiceBadge, serviceRecordBadge } from '@pkg/domain/contracting';
import type { AuthId, DateOnlyIso } from '@pkg/schema';
import {
  type KnownHoursSource,
  type Machine,
  type ServiceRecord,
  type ServiceRecordListInput,
  type ServiceRecordStatus,
  serviceRecordStatuses,
} from '@pkg/schema/contracting';
import type { ColumnFiltersState } from '@tanstack/react-table';
import { readMultiSelectFilter } from '@/components/data-table/column-filter-values.js';
import { type HoursToService, machineHoursToService } from '@/contracting/components/MachineServiceDue.js';

export const MACHINE_COLUMN_ID = 'machine';
export const MECHANIC_COLUMN_ID = 'mechanic';
export const START_COLUMN_ID = 'startDate';
export const STATUS_COLUMN_ID = 'status';

/**
 * A Services table row as its columns show it. A Machine Due for Service is pinned above the records and can be
 * booked in from its row; a Service Record fills the columns a pinned Machine leaves empty.
 */
export type ServicesTableRow = ({ pinned: true; recordId: null } | { pinned: false; recordId: string }) & {
  machine: Pick<Machine, 'id' | 'code' | 'categoryName' | 'categoryIcon' | 'categoryColour'>;
  mechanic: { id: AuthId; name: string } | null;
  startDate: DateOnlyIso | null;
  status: ServiceRecordStatus | null;
  badge: { label: string; colours: BadgeColorClassNames };
  /** Known Hours for a due Machine, with where they came from; a record's hours at its service carry neither. */
  reading: { hours: number | null; at: string | null; source: KnownHoursSource | null };
  nextServiceDue: { hours: number | null; toGo: HoursToService | null };
  notes: string | null;
};

export const dueRow = (machine: Machine): ServicesTableRow => ({
  pinned: true,
  recordId: null,
  machine,
  mechanic: null,
  startDate: null,
  status: null,
  badge: machineServiceBadge(machine),
  reading: { hours: machine.knownHours, at: machine.knownHoursAt, source: machine.knownHoursSource },
  nextServiceDue: { hours: machine.nextServiceDueHours, toGo: machineHoursToService(machine) },
  notes: null,
});

export const recordRow = (record: ServiceRecord): ServicesTableRow => ({
  pinned: false,
  recordId: record.id,
  machine: {
    id: record.machineId,
    code: record.machineCode,
    categoryName: record.categoryName,
    categoryIcon: record.categoryIcon,
    categoryColour: record.categoryColour,
  },
  mechanic:
    record.primaryMechanicUserId && record.mechanicName
      ? { id: record.primaryMechanicUserId, name: record.mechanicName }
      : null,
  startDate: record.startDate,
  status: record.status,
  badge: serviceRecordBadge(record.status),
  reading: { hours: record.readingAtServiceHours, at: null, source: null },
  nextServiceDue: { hours: record.nextServiceDueHoursSet, toGo: null },
  notes: record.notes,
});

/** Everything the Services table's column filters ask of the Service Record list. */
export function servicesTableFilters(columnFilters: ColumnFiltersState) {
  return {
    statuses: serviceRecordStatuses.filter((status) =>
      readMultiSelectFilter(columnFilters, STATUS_COLUMN_ID).includes(status),
    ),
    machineIds: readMultiSelectFilter(columnFilters, MACHINE_COLUMN_ID),
    mechanicUserIds: readMultiSelectFilter(columnFilters, MECHANIC_COLUMN_ID),
  } satisfies Partial<ServiceRecordListInput>;
}
