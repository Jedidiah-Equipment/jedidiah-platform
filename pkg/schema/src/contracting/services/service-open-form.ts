import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateOnlyIso } from '../../common/date.js';
import { emptyStringOr, requiredSelection } from '../../common/form.js';

/** Booking a Machine in as both the web and the phone hold it: no Mechanic yet is an empty string. */
export const OpenServiceValues = z.object({
  startDate: requiredSelection(DateOnlyIso, 'Choose the start date'),
  primaryMechanicUserId: emptyStringOr(AuthId),
  notes: z.string(),
});
export type OpenServiceValues = z.input<typeof OpenServiceValues>;

/** The open input's fields for valid form values, less the Machine. */
export const openServiceFields = (values: OpenServiceValues) => ({
  startDate: DateOnlyIso.parse(values.startDate),
  primaryMechanicUserId: values.primaryMechanicUserId || null,
  notes: values.notes,
});
