import type { BreakdownUrgency } from '@pkg/schema/contracting';

/** The one dialog the Machines card has open, naming its Machine Assignment by id so it follows refetches. */
export type MachineDialog =
  | { kind: 'plan' }
  | { kind: 'arrival' | 'departure' | 'gap'; stintId: string }
  | { kind: 'reading'; stintId: string; role: 'arrival' | 'departure' }
  | { kind: 'breakdown'; stintId: string; urgency: BreakdownUrgency };
