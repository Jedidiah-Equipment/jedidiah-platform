import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateOnlyIso } from '../../common/date.js';
import { emptyStringOr, requiredSelection } from '../../common/form.js';
import { FleetHours } from '../fleet/fleet.js';
import { NEXT_SERVICE_DUE_BELOW_READING_MESSAGE, ServiceRecordCloseInput } from './service-record.js';

const requiredHours = (message: string) => z.number({ error: message }).pipe(FleetHours);

/** Closing a service as both the web and the phone hold it: no Mechanic is an empty string, a blank number NaN. */
export const CloseServiceValues = z
  .object({
    endDate: requiredSelection(DateOnlyIso, 'Choose the end date'),
    readingAtServiceHours: requiredHours('Enter the reading at service'),
    primaryMechanicUserId: emptyStringOr(AuthId),
    notes: z.string(),
    nextServiceDueHours: requiredHours('Enter the next service due'),
  })
  .superRefine((values, ctx) => {
    if (values.nextServiceDueHours < values.readingAtServiceHours)
      ctx.addIssue({ code: 'custom', path: ['nextServiceDueHours'], message: NEXT_SERVICE_DUE_BELOW_READING_MESSAGE });
  });
export type CloseServiceValues = z.input<typeof CloseServiceValues>;

export function closeServiceInput(id: string, values: CloseServiceValues): ServiceRecordCloseInput {
  return ServiceRecordCloseInput.parse({
    ...values,
    id,
    primaryMechanicUserId: values.primaryMechanicUserId || null,
  });
}
