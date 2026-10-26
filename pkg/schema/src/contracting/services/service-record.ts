import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../../common/date.js';
import { createCursorQueryResult, createSearchedSortedCursorQueryInput } from '../../common/pagination.js';
import { nullableTrimmedTextInput, nullableTrimmedTextInputOptional } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';
import { categoryProjection, FleetHours } from '../fleet/fleet.js';
import { serviceRecordStatuses } from './service-enums.js';

export const ServiceRecordOpenInput = z
  .object({
    machineId: UUID,
    startDate: DateOnlyIso,
    primaryMechanicUserId: AuthId.nullable().optional(),
    notes: nullableTrimmedTextInput(),
  })
  .strict();
export type ServiceRecordOpenInput = z.infer<typeof ServiceRecordOpenInput>;
export const ServiceRecordPatchInput = z
  .object({
    id: UUID,
    startDate: DateOnlyIso.optional(),
    primaryMechanicUserId: AuthId.nullable().optional(),
    notes: nullableTrimmedTextInputOptional(),
  })
  .strict();
export type ServiceRecordPatchInput = z.infer<typeof ServiceRecordPatchInput>;
export const NEXT_SERVICE_DUE_BELOW_READING_MESSAGE = 'Next service due cannot be below the reading at service.';
export const ServiceRecordCloseInput = z
  .object({
    id: UUID,
    endDate: DateOnlyIso,
    readingAtServiceHours: FleetHours,
    primaryMechanicUserId: AuthId.nullable(),
    notes: nullableTrimmedTextInput(),
    /** The sticker: closing a service always sets the Machine's Next Service Due. */
    nextServiceDueHours: FleetHours,
  })
  .strict()
  .superRefine((value, ctx) => {
    if (value.nextServiceDueHours < value.readingAtServiceHours)
      ctx.addIssue({ code: 'custom', path: ['nextServiceDueHours'], message: NEXT_SERVICE_DUE_BELOW_READING_MESSAGE });
  });
export type ServiceRecordCloseInput = z.infer<typeof ServiceRecordCloseInput>;
export const ServiceRecord = z.object({
  id: UUID,
  machineId: UUID,
  machineCode: z.string(),
  /** The Machine's Category, so a list across Machines can show each one as the fleet does. */
  ...categoryProjection,
  startDate: DateOnlyIso,
  endDate: DateOnlyIso.nullable(),
  readingAtServiceHours: FleetHours.nullable(),
  primaryMechanicUserId: AuthId.nullable(),
  mechanicName: z.string().nullable(),
  notes: z.string().nullable(),
  nextServiceDueHoursSet: FleetHours.nullable(),
  status: z.enum(serviceRecordStatuses),
  closedAt: DateIso.nullable(),
  closedByName: z.string().nullable(),
  createdAt: DateIso,
  updatedAt: DateIso,
});
export type ServiceRecord = z.infer<typeof ServiceRecord>;
/** Service Records across the fleet, Booked In first: the Services table, or one Machine's with `limit: 0`. */
export const ServiceRecordListInput = createSearchedSortedCursorQueryInput({
  defaultSortDirection: 'desc',
  shape: {
    statuses: z.array(z.enum(serviceRecordStatuses)).default([]),
    machineIds: z.array(UUID).default([]),
    mechanicUserIds: z.array(AuthId).default([]),
  },
  sortBy: z.enum(['startDate']).default('startDate'),
});
export type ServiceRecordListInput = z.infer<typeof ServiceRecordListInput>;
export const ServiceRecordListResult = createCursorQueryResult(ServiceRecord);
export type ServiceRecordListResult = z.infer<typeof ServiceRecordListResult>;
/** What the Services table's column filters offer: only Machines and Mechanics some Service Record names. */
export const ServiceRecordFilterOptions = z.object({
  machines: z.object({ id: UUID, code: z.string() }).array(),
  mechanics: z.object({ id: AuthId, name: z.string() }).array(),
});
export type ServiceRecordFilterOptions = z.infer<typeof ServiceRecordFilterOptions>;
export const ServiceRecordIdInput = z.object({ id: UUID }).strict();
