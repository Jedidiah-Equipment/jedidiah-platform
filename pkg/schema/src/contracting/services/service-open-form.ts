import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateOnlyIso } from '../../common/date.js';
import { emptyStringOr, requiredSelection } from '../../common/form.js';
import { UUID } from '../../common/uuid.js';
import type { ServiceRecord } from './service-record.js';

/** Booking a Machine in as both the web and the phone hold it: no Mechanic yet is an empty string. */
export const OpenServiceValues = z.object({
  startDate: requiredSelection(DateOnlyIso, 'Choose the start date'),
  primaryMechanicUserId: emptyStringOr(AuthId),
  notes: z.string(),
});
export type OpenServiceValues = z.input<typeof OpenServiceValues>;

/** Book a service on the web and the phone: the Machine it was opened for, or the one picked. */
export const BookServiceValues = OpenServiceValues.extend({
  machineId: requiredSelection(UUID, 'Choose the Machine'),
});
export type BookServiceValues = z.input<typeof BookServiceValues>;

/** An open record's details as the edit form starts from them. */
export const openServiceValues = (
  record: Pick<ServiceRecord, 'startDate' | 'primaryMechanicUserId' | 'notes'>,
): OpenServiceValues => ({
  startDate: record.startDate,
  primaryMechanicUserId: record.primaryMechanicUserId ?? '',
  notes: record.notes ?? '',
});

/** The open input's fields for valid form values, less the Machine. */
export const openServiceFields = (values: OpenServiceValues) => ({
  startDate: DateOnlyIso.parse(values.startDate),
  primaryMechanicUserId: values.primaryMechanicUserId || null,
  notes: values.notes,
});
