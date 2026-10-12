import { z } from 'zod';
import { DateIso } from '../../common/date.js';
import { UUID } from '../../common/uuid.js';
import { CategoryColour, CategoryIconKey } from '../fleet/fleet.js';
import { UtilisationTargetPercent } from '../settings/settings.js';
import { ReportWindow, ReportWindowInput } from './report-window.js';

const Hours = z.number().nonnegative();
export const HourKindTotals = z.object({
  workHours: Hours,
  travelHours: Hours,
  unaccountedHours: Hours,
  unresolvedHours: Hours,
});
export type HourKindTotals = z.infer<typeof HourKindTotals>;

const DayCounts = z.object({
  activeDays: z.int().nonnegative(),
  fleetDays: z.int().nonnegative(),
  utilisationPercent: z.number().nullable(),
});

export const MachineUtilisation = DayCounts.extend({
  machineId: UUID,
  code: z.string(),
  categoryId: UUID,
  retiredAt: DateIso.nullable(),
}).extend(HourKindTotals.shape);
export type MachineUtilisation = z.infer<typeof MachineUtilisation>;

export const CategoryUtilisation = DayCounts.extend({
  categoryId: UUID,
  name: z.string(),
  icon: CategoryIconKey,
  colour: CategoryColour,
  machineCount: z.int().nonnegative(),
  activeMachineCount: z.int().nonnegative(),
  machines: MachineUtilisation.array(),
}).extend(HourKindTotals.shape);
export type CategoryUtilisation = z.infer<typeof CategoryUtilisation>;

export const FleetUtilisation = DayCounts.extend({
  machineCount: z.int().nonnegative(),
  activeMachineCount: z.int().nonnegative(),
  fleetLoadPercent: z.number().nullable(),
}).extend(HourKindTotals.shape);
export type FleetUtilisation = z.infer<typeof FleetUtilisation>;

export const UtilisationReport = z.object({
  window: ReportWindow,
  fleet: FleetUtilisation,
  categories: CategoryUtilisation.array(),
  utilisationTargetPercent: UtilisationTargetPercent.nullable(),
});
export type UtilisationReport = z.infer<typeof UtilisationReport>;

export const UtilisationTrendSubject = z.discriminatedUnion('kind', [
  z.object({ kind: z.literal('fleet') }),
  z.object({ kind: z.literal('category'), id: UUID }),
  z.object({ kind: z.literal('machine'), id: UUID }),
]);
export type UtilisationTrendSubject = z.infer<typeof UtilisationTrendSubject>;

export const UtilisationTrendInput = z.object({ window: ReportWindowInput, subject: UtilisationTrendSubject }).strict();
export type UtilisationTrendInput = z.infer<typeof UtilisationTrendInput>;

/** Twelve calendar months, oldest first, ending at the window's last month; each one a month window. */
export const UtilisationTrendPoint = DayCounts.extend({ month: z.string().regex(/^\d{4}-\d{2}$/) });
export type UtilisationTrendPoint = z.infer<typeof UtilisationTrendPoint>;
export const UtilisationTrend = z.object({
  subject: UtilisationTrendSubject,
  label: z.string(),
  months: UtilisationTrendPoint.array().length(12),
  utilisationTargetPercent: UtilisationTargetPercent.nullable(),
});
export type UtilisationTrend = z.infer<typeof UtilisationTrend>;
