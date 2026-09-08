import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { DateIso } from '../../common/date.js';
import { nullableTrimmedTextInput, nullableTrimmedTextInputOptional, requiredTrimmedText } from '../../common/text.js';
import { UUID } from '../../common/uuid.js';

export const FleetCode = requiredTrimmedText('Code is required').transform((value) => value.toUpperCase());
export const FleetName = requiredTrimmedText('Name is required');
export const FleetOptionalText = nullableTrimmedTextInput();
export const FleetHours = z.number().nonnegative().max(9999999999.99).multipleOf(0.01);
export const ServiceIntervalHours = FleetHours.refine(
  (value) => value > 0,
  'Service interval must be greater than zero',
);
export const MachineYear = z.int32();
export const PresetRate = z.number().nonnegative().max(9999999999.99).multipleOf(0.01);
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

export const CategoryCreateInput = z.object({ name: FleetName, presetRate: PresetRate.optional() }).strict();
export type CategoryCreateInput = z.infer<typeof CategoryCreateInput>;
export const CategoryPatchInput = CategoryCreateInput.partial().extend({ id: UUID }).strict();
export type CategoryPatchInput = z.infer<typeof CategoryPatchInput>;
export const Category = z.object({
  id: UUID,
  name: FleetName,
  presetRate: PresetRate.optional(),
  createdAt: DateIso,
  updatedAt: DateIso,
});
export type Category = z.infer<typeof Category>;

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
  categoryName: FleetName,
  currentDriverName: z.string().nullable(),
  availability: z.literal('in-yard'),
});
export type Machine = z.infer<typeof Machine>;

export const ImplementCreateInput = z
  .object({ code: FleetCode, implementType: FleetName, notes: FleetOptionalText })
  .strict();
export type ImplementCreateInput = z.infer<typeof ImplementCreateInput>;
export const ImplementPatchInput = z
  .object({
    id: UUID,
    code: FleetCode.optional(),
    implementType: FleetName.optional(),
    notes: nullableTrimmedTextInputOptional(),
  })
  .strict();
export type ImplementPatchInput = z.infer<typeof ImplementPatchInput>;
export const Implement = ImplementCreateInput.extend({ id: UUID, ...retirement });
export type Implement = z.infer<typeof Implement>;

/** The field picker exposes only the identity a reading capture needs. */
export const FieldMachine = Machine.pick({
  id: true,
  code: true,
  make: true,
  model: true,
  categoryId: true,
  categoryName: true,
  availability: true,
}).strip();
