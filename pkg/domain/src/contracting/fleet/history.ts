import type { FleetHistoryKind } from '@pkg/schema/contracting';

/** The History's Kind column, which sorts by these labels. */
export const fleetHistoryKindLabels: Record<FleetHistoryKind, string> = {
  reading: 'Readings',
  breakdown: 'Breakdowns',
  service: 'Services',
};
