import { getPlantDateNow } from '@pkg/domain';
import { DateOnlyIsoString, ProductUnitTransferInput, UUID } from '@pkg/schema';
import { z } from 'zod';

import { requiredSelection } from '@/components/form/utils/form-schema.js';

/** Where the machine goes. Stock is a state of the machine, not a Customer, so it needs a choice of its own. */
export type UnitTransferDestination = z.infer<typeof UnitTransferDestination>;
export const UnitTransferDestination = z.enum(['customer', 'stock']);

export type UnitTransferFormValues = z.infer<typeof UnitTransferFormValues>;
export const UnitTransferFormValues = z
  .object({
    destination: UnitTransferDestination,
    note: z.string(),
    occurredOn: requiredSelection(DateOnlyIsoString, 'Enter the date this transfer happened'),
    toCustomerId: z.string(),
  })
  .strict()
  .superRefine((value, context) => {
    if (value.destination === 'customer' && !UUID.safeParse(value.toCustomerId).success) {
      context.addIssue({ code: 'custom', message: 'Select a customer', path: ['toCustomerId'] });
    }
  });

/** A transfer is dated the day it happened, which is usually today but never later than today. */
export function createUnitTransferFormValues(): UnitTransferFormValues {
  return {
    destination: 'customer',
    note: '',
    occurredOn: getPlantDateNow(),
    toCustomerId: '',
  };
}

/** Form → schema. Returning the machine to Stock is a transfer to nobody, not to a placeholder Customer. */
export function toProductUnitTransferInput(id: UUID, values: UnitTransferFormValues): ProductUnitTransferInput {
  return ProductUnitTransferInput.parse({
    id,
    note: values.note,
    occurredOn: values.occurredOn,
    toCustomerId: values.destination === 'stock' ? null : values.toCustomerId,
  });
}
