import { AuthId, UUID } from '@pkg/schema';
import {
  FleetCode,
  FleetHours,
  FleetName,
  FleetOptionalText,
  type Implement,
  ImplementCreateInput,
  ImplementPatchInput,
  type Machine,
  MachineCreateInput,
  MachinePatchInput,
  MachineYear,
  ServiceIntervalHours,
} from '@pkg/schema/contracting';
import { z } from 'zod';
import { emptyStringOr, optionalNumber, requiredSelection } from '@/components/form/utils/form-schema.js';

const optionalText = z.string().refine((value) => FleetOptionalText.safeParse(value).success);
export const MachineCreateValues = z.object({
  code: FleetCode,
  make: FleetName,
  model: FleetName,
  categoryId: requiredSelection(UUID, 'Select a category'),
});
export const MachineFormValues = MachineCreateValues.extend({
  year: optionalNumber(MachineYear),
  registration: optionalText,
  currentDriverUserId: emptyStringOr(AuthId),
  notes: optionalText,
  serviceIntervalHours: optionalNumber(ServiceIntervalHours),
  nextServiceDueHours: optionalNumber(FleetHours),
});
export type MachineFormValues = z.infer<typeof MachineFormValues>;
export function machineFormValues(machine: Machine): MachineFormValues {
  return {
    code: machine.code,
    make: machine.make,
    model: machine.model,
    categoryId: machine.categoryId,
    year: machine.year ?? NaN,
    registration: machine.registration ?? '',
    currentDriverUserId: machine.currentDriverUserId ?? '',
    notes: machine.notes ?? '',
    serviceIntervalHours: machine.serviceIntervalHours ?? NaN,
    nextServiceDueHours: machine.nextServiceDueHours ?? NaN,
  };
}
export function machinePatchInput(id: string, values: MachineFormValues) {
  return MachinePatchInput.parse({
    ...values,
    id,
    year: Number.isNaN(values.year) ? null : values.year,
    currentDriverUserId: values.currentDriverUserId || null,
    serviceIntervalHours: Number.isNaN(values.serviceIntervalHours) ? null : values.serviceIntervalHours,
    nextServiceDueHours: Number.isNaN(values.nextServiceDueHours) ? null : values.nextServiceDueHours,
  });
}
export const createMachineInput = (values: z.infer<typeof MachineCreateValues>) => MachineCreateInput.parse(values);
export const ImplementCreateValues = z.object({ code: FleetCode, implementType: FleetName });
export const ImplementFormValues = ImplementCreateValues.extend({ notes: optionalText });
export type ImplementFormValues = z.infer<typeof ImplementFormValues>;
export const implementFormValues = (row: Implement): ImplementFormValues => ({
  code: row.code,
  implementType: row.implementType,
  notes: row.notes ?? '',
});
export const implementPatchInput = (id: string, values: ImplementFormValues) =>
  ImplementPatchInput.parse({ ...values, id });
export const createImplementInput = (values: z.infer<typeof ImplementCreateValues>) =>
  ImplementCreateInput.parse(values);
