import { Machine, ServiceRecord } from '@pkg/schema/contracting';

/** A parsed {@link Machine} for page and widget tests; pass `overrides` for the fields under test. */
export function buildMachine(overrides: Partial<Record<keyof Machine, unknown>> = {}): Machine {
  return Machine.parse({
    id: '00000000-0000-4000-8000-000000000001',
    code: 'KOL220-2',
    make: 'Kobelco',
    model: '220',
    categoryId: '00000000-0000-4000-8000-0000000000c1',
    categoryName: 'Excavator',
    categoryIcon: 'excavator',
    categoryColour: 'orange',
    year: null,
    registration: null,
    currentDriverUserId: null,
    currentDriverName: null,
    notes: null,
    serviceIntervalHours: null,
    nextServiceDueHours: 4850,
    serviceAlertHours: null,
    latestReadingHours: 4862.5,
    latestReadingAt: '2026-10-21T08:00:00.000Z',
    latestReadingProvider: null,
    hoursToService: -12.5,
    effectiveServiceAlertHours: 100,
    serviceDueStatus: 'overdue',
    bookedInServiceId: null,
    busyOnJob: null,
    serialNumber: null,
    johnDeere: null,
    retiredAt: null,
    retiredReason: null,
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...overrides,
  });
}

/** A parsed {@link ServiceRecord}, Booked In by default; pass `overrides` for the fields under test. */
export function buildServiceRecord(overrides: Partial<Record<keyof ServiceRecord, unknown>> = {}): ServiceRecord {
  return ServiceRecord.parse({
    id: '00000000-0000-4000-8000-0000000000a1',
    machineId: '00000000-0000-4000-8000-000000000002',
    machineCode: 'JD110-1',
    categoryName: 'Tractor',
    categoryIcon: 'tractor',
    categoryColour: 'lime',
    startDate: '2026-10-20',
    endDate: null,
    readingAtServiceHours: null,
    primaryMechanicUserId: null,
    mechanicName: null,
    notes: 'Oil and filters',
    nextServiceDueHoursSet: null,
    status: 'open',
    closedAt: null,
    closedByName: null,
    createdAt: '2026-10-20T08:00:00.000Z',
    updatedAt: '2026-10-20T08:00:00.000Z',
    ...overrides,
  });
}
