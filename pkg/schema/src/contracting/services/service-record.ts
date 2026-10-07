import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso, DateOnlyIso } from '../../common/date.js';
import { nullableTrimmedTextInput, nullableTrimmedTextInputOptional } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';
import { FleetHours } from '../fleet/fleet.js';
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
export const ServiceRecordListInput = z.object({ machineId: UUID }).strict();
export type ServiceRecordListInput = z.infer<typeof ServiceRecordListInput>;
export const ServiceRecordIdInput = z.object({ id: UUID }).strict();
