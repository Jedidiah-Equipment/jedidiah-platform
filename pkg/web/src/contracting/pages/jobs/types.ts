import type { BreakdownUrgency } from '@pkg/schema/contracting';
import type { StintHoursMode } from './StintHoursDialog.js';

/** The one dialog the Machines card has open, naming its Machine Assignment by id so it follows refetches. */
export type MachineDialog =
  | { kind: 'plan' }
  | { kind: 'hours'; mode: StintHoursMode; stintId: string }
  | { kind: 'travel'; stintId: string }
  | { kind: 'breakdown'; stintId: string; urgency: BreakdownUrgency };
