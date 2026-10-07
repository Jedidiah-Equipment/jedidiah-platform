/** Where a Machine stands against its Next Service Due, derived from its latest Hour Reading. */
export const serviceDueStatuses = ['unknown', 'ok', 'due-soon', 'overdue'] as const;
export type ServiceDueStatus = (typeof serviceDueStatuses)[number];
export const serviceRecordStatuses = ['open', 'closed'] as const;
export type ServiceRecordStatus = (typeof serviceRecordStatuses)[number];

/** Every refusal a Service Record write can carry, as the server sends it. */
export const serviceErrorCodes = [
  'service.not_found',
  'service.forbidden',
  'service.closed',
  // The user is not a non-device Mechanic.
  'service.invalid_mechanic',
  'service.retired_machine',
  // Next Service Due below the reading at service.
  'service.invalid_close',
] as const;
export type ServiceErrorCode = (typeof serviceErrorCodes)[number];
