import type { FieldDriver, FieldImplement } from '@pkg/schema/contracting';
import { createContext, useContext } from 'react';
import type { JobSheet } from './types.js';

/** The one dialog the Machines card has open, naming its Machine Assignment by id so it follows refetches. */
export type MachineDialog =
  | { kind: 'plan' }
  | { kind: 'arrival' | 'departure' | 'gap'; stintId: string }
  | { kind: 'reading'; stintId: string; role: 'arrival' | 'departure' };

/** What each Machine card reads: permissions, pick-list options, and how to open a dialog. */
type Machines = {
  sheet: JobSheet;
  implementOptions: readonly FieldImplement[];
  drivers: readonly FieldDriver[];
  open: (dialog: MachineDialog) => void;
};

export const MachinesContext = createContext<Machines | null>(null);

export function useMachines() {
  const machines = useContext(MachinesContext);
  if (!machines) throw new Error('Machine cards render inside MachinesCard.');
  return machines;
}
