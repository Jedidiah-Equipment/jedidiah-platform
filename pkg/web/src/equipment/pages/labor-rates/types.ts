import {
  LaborDepartmentRate,
  LaborHourlyRate,
  LaborOverheadPercentage,
  LaborRateCardUpdateInput,
  type LaborRateCardView,
  WORK_ITEM_DEPARTMENTS,
} from '@pkg/schema/equipment';
import { z } from 'zod';
import { optionalNumber } from '@/components/form/utils/form-schema.js';

export const LaborRateFormValues = LaborRateCardUpdateInput.omit({ rates: true }).extend({
  rates: z
    .array(
      LaborDepartmentRate.extend({
        costToCompanyRate: optionalNumber(LaborHourlyRate),
        billingRate: optionalNumber(LaborHourlyRate),
        consumablesPercentage: optionalNumber(LaborOverheadPercentage),
      }),
    )
    .length(WORK_ITEM_DEPARTMENTS.length),
});
export type LaborRateFormValues = z.infer<typeof LaborRateFormValues>;

/** The form's blanks are NaN where the card's are null. */
export function laborRateFormValues(card: LaborRateCardView): LaborRateFormValues {
  return {
    hoursPerWorkingDay: card.hoursPerWorkingDay,
    managementOverheadPercentage: card.managementOverheadPercentage ?? NaN,
    rates: card.rates.map((rate) => ({
      ...rate,
      costToCompanyRate: rate.costToCompanyRate ?? NaN,
      billingRate: rate.billingRate ?? NaN,
      consumablesPercentage: rate.consumablesPercentage ?? NaN,
    })),
  };
}

/** Maps validated form values back to the API shape; the submit validator has already run. */
export function laborRateFormToInput(values: LaborRateFormValues): LaborRateCardUpdateInput {
  const nullable = (value: number) => (Number.isNaN(value) ? null : value);
  return {
    ...values,
    rates: values.rates.map((rate) => ({
      ...rate,
      costToCompanyRate: nullable(rate.costToCompanyRate),
      billingRate: nullable(rate.billingRate),
      consumablesPercentage: nullable(rate.consumablesPercentage),
    })),
  };
}
