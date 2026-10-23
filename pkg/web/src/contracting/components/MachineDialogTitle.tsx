import type { Assignment, Machine } from '@pkg/schema/contracting';
import type React from 'react';
import { CategoryIcon } from './CategoryIcon.js';

export type MachineDialogSubject = Pick<Assignment, 'machineCode' | 'categoryIcon' | 'categoryColour'>;

/** A Machine as a dialog title names it; Assignments already carry this shape. */
export const machineDialogSubject = ({
  code,
  categoryIcon,
  categoryColour,
}: Pick<Machine, 'code' | 'categoryIcon' | 'categoryColour'>): MachineDialogSubject => ({
  machineCode: code,
  categoryIcon,
  categoryColour,
});

export function MachineDialogTitle({
  machine,
  children,
}: {
  machine: MachineDialogSubject | null;
  children: React.ReactNode;
}) {
  return (
    <span className="flex items-center gap-2 pr-6">
      {machine ? (
        <>
          <CategoryIcon icon={machine.categoryIcon} colour={machine.categoryColour} size={14} />
          <span>
            {machine.machineCode} · {children}
          </span>
        </>
      ) : (
        children
      )}
    </span>
  );
}
