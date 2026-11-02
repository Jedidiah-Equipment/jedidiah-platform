import type { FleetHistoryKind, FleetHistoryRow } from '@pkg/schema/contracting';

/** The History's Kind column, which sorts by these labels. */
export const fleetHistoryKindLabels: Record<FleetHistoryKind, string> = {
  reading: 'Readings',
  breakdown: 'Breakdowns',
  service: 'Services',
};

/** A History row's identity: a stint's arrival and departure rows share its id. */
export const fleetHistoryRowKey = ({ kind, readingRole, id }: Pick<FleetHistoryRow, 'kind' | 'readingRole' | 'id'>) =>
  `${kind}-${readingRole ?? ''}-${id}`;
