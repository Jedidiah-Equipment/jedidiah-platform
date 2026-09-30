import type { Assignment } from '@pkg/schema/contracting';
import type React from 'react';
import { CategoryIcon } from './CategoryIcon.js';

export type MachineDialogSubject = Pick<Assignment, 'machineCode' | 'categoryIcon' | 'categoryColour'>;

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
