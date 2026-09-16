import {
  MeasureTypeName,
  RateAmount,
  RateBasis,
  RateCreateInput,
  RateName,
  type RatePatchInput,
} from '@pkg/schema/contracting';
import { z } from 'zod';

export const RateFormValues = z.object({
  name: RateName,
  basis: RateBasis,
  measureTypeId: z.string(),
  amount: RateAmount,
});
export type RateFormValues = z.infer<typeof RateFormValues>;

function addRateInputIssues(values: RateFormValues, ctx: z.RefinementCtx) {
  const result = RateCreateInput.safeParse(toRateInput(values));
  if (!result.success)
    for (const issue of result.error.issues) ctx.addIssue({ code: 'custom', path: issue.path, message: issue.message });
}

export const RateCreateValues = RateFormValues.superRefine(addRateInputIssues);
export const RateEditValues = RateFormValues.extend({ active: z.boolean() }).superRefine(addRateInputIssues);
export type RateEditValues = z.infer<typeof RateEditValues>;

export const toRateInput = (values: RateFormValues) => ({
  name: values.name,
  basis: values.basis,
  measureTypeId: values.basis === 'measure' ? values.measureTypeId : null,
  amount: values.amount,
});

export const toRatePatchInput = (id: string, values: RateEditValues): RatePatchInput => ({
  id,
  ...toRateInput(values),
  active: values.active,
});

export const rateBasisLabels = { time: 'Time (per hour)', measure: 'Measure (per unit)' } as const;
export const rateBasisOptions = RateBasis.options.map((value) => ({ value, label: rateBasisLabels[value] }));

export const MeasureTypeFormValues = z.object({ name: MeasureTypeName });
export type MeasureTypeFormValues = z.infer<typeof MeasureTypeFormValues>;
