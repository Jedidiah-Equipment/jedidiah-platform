import { z } from 'zod';
import { DateIso } from '../../common/date.js';
import { requiredTrimmedText } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';

export const rateBases = ['time', 'measure'] as const;
export const RateBasis = z.enum(rateBases);
export type RateBasis = z.infer<typeof RateBasis>;

export const MeasureTypeName = requiredTrimmedText('Measure type name is required');
export const MeasureTypeCreateInput = z.object({ name: MeasureTypeName }).strict();
export type MeasureTypeCreateInput = z.infer<typeof MeasureTypeCreateInput>;
export const MeasureTypePatchInput = z.object({ id: UUID, name: MeasureTypeName.optional() }).strict();
export type MeasureTypePatchInput = z.infer<typeof MeasureTypePatchInput>;
export const MeasureType = z.object({
  id: UUID,
  name: MeasureTypeName,
  displayOrder: z.int(),
  inUse: z.boolean(),
  createdAt: DateIso,
  updatedAt: DateIso,
});
export type MeasureType = z.infer<typeof MeasureType>;

export const RateName = requiredTrimmedText('Rate name is required');
/** Zero is not a Rate: Pricing supplies No charge as a built-in option. */
export const RateAmount = z.number().positive().max(9999999999.99).multipleOf(0.01);

const rateBasisRule = (value: { basis: RateBasis; measureTypeId: string | null }, ctx: z.RefinementCtx) => {
  if (value.basis === 'measure' && value.measureTypeId === null)
    ctx.addIssue({
      code: 'custom',
      path: ['measureTypeId'],
      message: 'Choose the Measure Type this rate bills per unit of',
    });
  if (value.basis === 'time' && value.measureTypeId !== null)
    ctx.addIssue({ code: 'custom', path: ['measureTypeId'], message: 'A time rate has no Measure Type' });
};

export const RateCreateInput = z
  .object({ name: RateName, basis: RateBasis, measureTypeId: UUID.nullable().default(null), amount: RateAmount })
  .strict()
  .superRefine(rateBasisRule);
export type RateCreateInput = z.infer<typeof RateCreateInput>;

export const RatePatchInput = z
  .object({
    id: UUID,
    name: RateName.optional(),
    basis: RateBasis.optional(),
    measureTypeId: UUID.nullable().optional(),
    amount: RateAmount.optional(),
    active: z.boolean().optional(),
  })
  .strict()
  .superRefine((value, ctx) => {
    if ((value.basis === undefined) !== (value.measureTypeId === undefined))
      ctx.addIssue({ code: 'custom', path: ['basis'], message: 'Send basis and measureTypeId together' });
    if (value.basis !== undefined && value.measureTypeId !== undefined)
      rateBasisRule({ basis: value.basis, measureTypeId: value.measureTypeId }, ctx);
  });
export type RatePatchInput = z.infer<typeof RatePatchInput>;

export const Rate = z.object({
  id: UUID,
  name: RateName,
  basis: RateBasis,
  measureTypeId: UUID.nullable(),
  measureTypeName: MeasureTypeName.nullable(),
  amount: RateAmount,
  displayOrder: z.int(),
  active: z.boolean(),
  inUse: z.boolean(),
  createdAt: DateIso,
  updatedAt: DateIso,
});
export type Rate = z.infer<typeof Rate>;

export const RateListInput = z.object({ status: z.enum(['active', 'inactive', 'all']).default('all') });
export type RateListInput = z.infer<typeof RateListInput>;
export const ReorderInput = z.object({ orderedIds: z.array(UUID).min(1) }).strict();
export type ReorderInput = z.infer<typeof ReorderInput>;
