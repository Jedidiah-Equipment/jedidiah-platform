import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso } from '../../common/date.js';
import { nullableTrimmedTextInput, nullableTrimmedTextInputOptional, requiredTrimmedText } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';
import { categoryColours, categoryIconKeys, categoryKinds } from './category-icon-keys.js';

export const FleetCode = requiredTrimmedText('Code is required').transform((value) => value.toUpperCase());
export const FleetName = requiredTrimmedText('Name is required');
export const FleetOptionalText = nullableTrimmedTextInput();
export const FleetHours = z.number().nonnegative().max(9999999999.99).multipleOf(0.01);
export const ServiceIntervalHours = FleetHours.refine(
  (value) => value > 0,
  'Service interval must be greater than zero',
);
export const MachineYear = z.int32();
export const FleetIdInput = z.object({ id: UUID });
export const FleetRetireInput = FleetIdInput.extend({
  reason: requiredTrimmedText('Retirement reason is required'),
}).strict();
export type FleetRetireInput = z.infer<typeof FleetRetireInput>;
export const FleetListInput = z.object({
  search: z.string().trim().default(''),
  status: z.enum(['active', 'retired', 'all']).default('active'),
});
export type FleetListInput = z.infer<typeof FleetListInput>;
export const MachineListInput = FleetListInput.extend({ categoryId: UUID.optional() });
export type MachineListInput = z.infer<typeof MachineListInput>;

export const CategoryKind = z.enum(categoryKinds);
export type CategoryKind = z.infer<typeof CategoryKind>;
export const CategoryIcon = z.enum(categoryIconKeys);
export type CategoryIconKey = z.infer<typeof CategoryIcon>;
export const CategoryColour = z.enum(categoryColours);
export type CategoryColour = z.infer<typeof CategoryColour>;
/** Icon and colour fall back to the kind's default in core when omitted. */
export const CategoryCreateInput = z
  .object({ name: FleetName, kind: CategoryKind, icon: CategoryIcon.optional(), colour: CategoryColour.optional() })
  .strict();
export type CategoryCreateInput = z.infer<typeof CategoryCreateInput>;
export const CategoryPatchInput = CategoryCreateInput.partial().extend({ id: UUID }).strict();
export type CategoryPatchInput = z.infer<typeof CategoryPatchInput>;
export const Category = z.object({
  id: UUID,
  name: FleetName,
  kind: CategoryKind,
  icon: CategoryIcon,
  colour: CategoryColour,
  /** Referenced by a Machine or Implement, which locks the kind. */
  inUse: z.boolean(),
  createdAt: DateIso,
  updatedAt: DateIso,
});
export type Category = z.infer<typeof Category>;
export const CategoryListInput = z.object({ kind: CategoryKind.optional() });
export type CategoryListInput = z.infer<typeof CategoryListInput>;
const categoryProjection = { categoryName: FleetName, categoryIcon: CategoryIcon, categoryColour: CategoryColour };

export const MachineCreateInput = z
  .object({
    code: FleetCode,
    make: FleetName,
    model: FleetName,
    categoryId: UUID,
    year: MachineYear.nullable().default(null),
    registration: FleetOptionalText,
    currentDriverUserId: AuthId.nullable().default(null),
    notes: FleetOptionalText,
    serviceIntervalHours: ServiceIntervalHours.nullable().default(null),
    nextServiceDueHours: FleetHours.nullable().default(null),
  })
  .strict();
export type MachineCreateInput = z.infer<typeof MachineCreateInput>;
export const MachinePatchInput = z
  .object({
    id: UUID,
    code: FleetCode.optional(),
    make: FleetName.optional(),
    model: FleetName.optional(),
    categoryId: UUID.optional(),
    year: MachineYear.nullable().optional(),
    registration: nullableTrimmedTextInputOptional(),
    currentDriverUserId: AuthId.nullable().optional(),
    notes: nullableTrimmedTextInputOptional(),
    serviceIntervalHours: ServiceIntervalHours.nullable().optional(),
    nextServiceDueHours: FleetHours.nullable().optional(),
  })
  .strict();
export type MachinePatchInput = z.infer<typeof MachinePatchInput>;
const retirement = {
  retiredAt: DateIso.nullable(),
  retiredReason: z.string().nullable(),
  createdAt: DateIso,
  updatedAt: DateIso,
};
export const Machine = MachineCreateInput.extend({
  id: UUID,
  ...retirement,
  ...categoryProjection,
  currentDriverName: z.string().nullable(),
  availability: z.literal('in-yard'),
});
export type Machine = z.infer<typeof Machine>;

export const ImplementCreateInput = z.object({ code: FleetCode, categoryId: UUID, notes: FleetOptionalText }).strict();
export type ImplementCreateInput = z.infer<typeof ImplementCreateInput>;
export const ImplementPatchInput = z
  .object({
    id: UUID,
    code: FleetCode.optional(),
    categoryId: UUID.optional(),
    notes: nullableTrimmedTextInputOptional(),
  })
  .strict();
export type ImplementPatchInput = z.infer<typeof ImplementPatchInput>;
export const Implement = ImplementCreateInput.extend({ id: UUID, ...retirement, ...categoryProjection });
export type Implement = z.infer<typeof Implement>;
export const ImplementCodeSuggestInput = z.object({ categoryId: UUID }).strict();
export type ImplementCodeSuggestInput = z.infer<typeof ImplementCodeSuggestInput>;
export const ImplementCodeSuggestion = z.object({ code: FleetCode });
export type ImplementCodeSuggestion = z.infer<typeof ImplementCodeSuggestion>;

/** The field picker exposes only the identity a reading capture needs. */
export const FieldMachine = Machine.pick({
  id: true,
  code: true,
  make: true,
  model: true,
  categoryId: true,
  categoryName: true,
  categoryIcon: true,
  categoryColour: true,
  availability: true,
}).strip();
