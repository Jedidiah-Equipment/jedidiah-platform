import { z } from 'zod';
import { AuthId } from '../../auth/auth-id.js';
import { ReportWindow } from './report-window.js';

export const MechanicPerformanceRow = z.object({
  /** Null is the Unassigned row. */
  mechanicUserId: AuthId.nullable(),
  name: z.string(),
  solvedCount: z.int().nonnegative(),
  /** Mean of solvedAt − reportedAt over the window's solved Breakdowns, in days; null when none. */
  averageReportToSolvedDays: z.number().nonnegative().nullable(),
  notSolvedCount: z.int().nonnegative(),
});
export type MechanicPerformanceRow = z.infer<typeof MechanicPerformanceRow>;

export const MechanicPerformanceReport = z.object({
  window: ReportWindow,
  rows: MechanicPerformanceRow.array(),
});
export type MechanicPerformanceReport = z.infer<typeof MechanicPerformanceReport>;
