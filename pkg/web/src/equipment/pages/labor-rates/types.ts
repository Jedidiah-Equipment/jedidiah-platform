import {
  LaborDepartmentRate,
  LaborHourlyRate,
  LaborOverheadPercentage,
  type LaborRateCard,
  LaborRateCardUpdateInput,
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

export function laborRateFormValues(card: LaborRateCard): LaborRateFormValues {
  return {
    ...card,
    rates: card.rates.map((rate) => ({
      ...rate,
      costToCompanyRate: rate.costToCompanyRate ?? NaN,
      billingRate: rate.billingRate ?? NaN,
      consumablesPercentage: rate.consumablesPercentage ?? NaN,
    })),
  };
}

export function laborRateFormToInput(values: LaborRateFormValues): LaborRateCardUpdateInput {
  const nullable = (value: number) => (Number.isNaN(value) ? null : value);
  return LaborRateCardUpdateInput.parse({
    ...values,
    rates: values.rates.map((rate) => ({
      ...rate,
      costToCompanyRate: nullable(rate.costToCompanyRate),
      billingRate: nullable(rate.billingRate),
      consumablesPercentage: nullable(rate.consumablesPercentage),
    })),
  });
}
