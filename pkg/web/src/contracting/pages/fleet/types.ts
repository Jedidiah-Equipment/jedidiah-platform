import { AuthId, UUID } from '@pkg/schema';
import {
  CategoryColour,
  CategoryIconKey,
  CategoryKind,
  FleetCode,
  FleetHours,
  FleetListInput,
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
import { emptyStringOr, nanToNull, optionalNumber, requiredSelection } from '@/components/form/utils/form-schema.js';

export const fleetStatusOptions = FleetListInput.shape.status.unwrap().options;
export const fleetStatusLabels: Record<FleetListInput['status'], string> = {
  active: 'Active fleet',
  retired: 'Retired',
  all: 'All fleet',
};

export const CategoryFormValues = z.object({
  name: FleetName,
  kind: CategoryKind,
  icon: CategoryIconKey,
  colour: CategoryColour,
});

export const MachineCreateValues = z.object({
  code: FleetCode,
  make: FleetName,
  model: FleetName,
  categoryId: requiredSelection(UUID, 'Select a category'),
});
export const MachineFormValues = MachineCreateValues.extend({
  year: optionalNumber(MachineYear),
  registration: emptyStringOr(FleetOptionalText),
  currentDriverUserId: emptyStringOr(AuthId),
  notes: emptyStringOr(FleetOptionalText),
  serviceIntervalHours: optionalNumber(ServiceIntervalHours),
  nextServiceDueHours: optionalNumber(FleetHours),
});
export type MachineFormValues = z.input<typeof MachineFormValues>;
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
    year: nanToNull(values.year),
    currentDriverUserId: values.currentDriverUserId || null,
    serviceIntervalHours: nanToNull(values.serviceIntervalHours),
    nextServiceDueHours: nanToNull(values.nextServiceDueHours),
  });
}
export const createMachineInput = (values: z.infer<typeof MachineCreateValues>) => MachineCreateInput.parse(values);
export const ImplementCreateValues = z.object({
  categoryId: requiredSelection(UUID, 'Select a category'),
  code: FleetCode,
});
export const ImplementFormValues = ImplementCreateValues.extend({ notes: emptyStringOr(FleetOptionalText) });
export type ImplementFormValues = z.input<typeof ImplementFormValues>;
export const implementFormValues = (row: Implement): ImplementFormValues => ({
  code: row.code,
  categoryId: row.categoryId,
  notes: row.notes ?? '',
});
export const implementPatchInput = (id: string, values: ImplementFormValues) =>
  ImplementPatchInput.parse({ ...values, id });
export const createImplementInput = (values: z.infer<typeof ImplementCreateValues>) =>
  ImplementCreateInput.parse(values);
