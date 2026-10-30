import { serviceDueNeedsAttention } from '@pkg/domain/contracting';
import { AuthId, DateOnlyIso, emptyStringOr, requiredSelection, UUID } from '@pkg/schema';
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
  NEXT_SERVICE_DUE_BELOW_READING_MESSAGE,
  OpenServiceValues,
  ServiceDueSoonThresholdHours,
  type ServiceDueStatus,
  ServiceIntervalHours,
  ServiceRecordCloseInput,
} from '@pkg/schema/contracting';
import { z } from 'zod';
import { nanToNull, optionalNumber } from '@/components/form/utils/form-schema.js';

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
  serviceAlertHours: optionalNumber(ServiceDueSoonThresholdHours),
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
    serviceAlertHours: machine.serviceAlertHours ?? NaN,
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
    serviceAlertHours: nanToNull(values.serviceAlertHours),
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

const requiredHours = (message: string) => z.number({ error: message }).pipe(FleetHours);
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
/** The Book a service dialog: a service in the workshop, on the Machine it was opened for or the one picked. */
export const BookServiceValues = OpenServiceValues.extend({
  machineId: requiredSelection(UUID, 'Choose the Machine'),
});
export type BookServiceValues = z.input<typeof BookServiceValues>;

export const SERVICE_COLUMN_ID = 'nextServiceDue';
/** The Machines list's Service filter: Needs attention is due soon or overdue, the rest name one status. */
export const serviceFilterValues = ['attention', 'ok', 'unknown'] as const;
export type ServiceFilterValue = (typeof serviceFilterValues)[number];
export const serviceFilterOptions: { label: string; value: ServiceFilterValue }[] = [
  { label: 'Needs attention', value: 'attention' },
  { label: 'On track', value: 'ok' },
  { label: 'Unknown', value: 'unknown' },
];
export const serviceFilterMatches = (status: ServiceDueStatus, value: unknown) =>
  value === 'attention' ? serviceDueNeedsAttention(status) : status === value;

export const BUSY_COLUMN_ID = 'busyWith';
/** The Machines list's Busy with filter: On Job while an Assignment is on site, In Yard while free and not Retired. */
export const busyFilterValues = ['on-job', 'in-yard'] as const;
export type BusyFilterValue = (typeof busyFilterValues)[number];
export const busyFilterOptions: { label: string; value: BusyFilterValue }[] = [
  { label: 'On Job', value: 'on-job' },
  { label: 'In Yard', value: 'in-yard' },
];
export const busyFilterMatches = (machine: { busyOnJob: object | null; retiredAt: string | null }, value: unknown) =>
  value === 'on-job' ? machine.busyOnJob !== null : !machine.busyOnJob && !machine.retiredAt;
