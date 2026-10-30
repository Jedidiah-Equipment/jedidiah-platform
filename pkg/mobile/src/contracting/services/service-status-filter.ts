import { serviceRecordStatusLabels } from '@pkg/domain/contracting';
import { type ServiceRecordStatus, serviceRecordStatuses } from '@pkg/schema/contracting';
import type { ListControlOption } from '@/components/ListControls';

/** One status or every status, as web's Services Status filter offers them. */
export type StatusFilter = ServiceRecordStatus | 'all';

export const isStatusFilter = (value: unknown): value is StatusFilter =>
  value === 'all' || serviceRecordStatuses.includes(value as ServiceRecordStatus);

/** The statuses a filter lists. */
export const statusesFor = (filter: StatusFilter): ServiceRecordStatus[] =>
  filter === 'all' ? [...serviceRecordStatuses] : [filter];

export const statusOptions: ListControlOption<StatusFilter>[] = [
  ...serviceRecordStatuses.map((status) => ({ label: serviceRecordStatusLabels[status], value: status })),
  { label: 'All', value: 'all' },
];
