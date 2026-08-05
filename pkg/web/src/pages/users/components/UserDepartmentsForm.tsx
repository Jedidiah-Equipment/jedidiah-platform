import { departmentLabels } from '@pkg/domain';
import { DEPARTMENTS, type Department } from '@pkg/schema';
import { IconChevronDown } from '@tabler/icons-react';
import type React from 'react';
import { useId } from 'react';

import { DepartmentIcon } from '@/components/departments/index.js';
import { Button } from '@/components/ui/button.js';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu.js';
import { Field, FieldLabel } from '@/components/ui/field.js';

type UserDepartmentsFormProps = {
  initialDepartments: readonly Department[];
  isPending: boolean;
  onDepartmentsChange: (departments: readonly Department[]) => void;
};

export const UserDepartmentsForm: React.FC<UserDepartmentsFormProps> = ({
  initialDepartments,
  isPending,
  onDepartmentsChange,
}) => {
  const fieldId = useId();
  const selectedDepartments = new Set(initialDepartments);
  const selectionLabel = getDepartmentSelectionLabel(initialDepartments);

  return (
    <Field data-disabled={isPending}>
      <FieldLabel htmlFor={fieldId}>Departments</FieldLabel>
      <DropdownMenu>
        <DropdownMenuTrigger
          render={
            <Button
              className="w-full justify-between data-[empty=true]:text-muted-foreground"
              data-empty={selectedDepartments.size === 0}
              disabled={isPending}
              id={fieldId}
              type="button"
              variant="outline"
            />
          }
        >
          <span className="min-w-0 truncate">{selectionLabel}</span>
          <IconChevronDown data-icon="inline-end" />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start">
          <DropdownMenuGroup>
            {DEPARTMENTS.map((department) => (
              <DropdownMenuCheckboxItem
                checked={selectedDepartments.has(department)}
                key={department}
                onCheckedChange={(checked) =>
                  onDepartmentsChange(toggleDepartmentSelection(initialDepartments, department, checked))
                }
              >
                <DepartmentIcon className="size-4 text-muted-foreground" department={department} />
                {departmentLabels[department]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuGroup>
        </DropdownMenuContent>
      </DropdownMenu>
    </Field>
  );
};

export function getDepartmentSelectionLabel(departments: readonly Department[]): string {
  const selectedDepartments = new Set(departments);
  const labels = DEPARTMENTS.filter((department) => selectedDepartments.has(department)).map(
    (department) => departmentLabels[department],
  );

  return labels.length > 0 ? labels.join(', ') : 'Select departments';
}

export function toggleDepartmentSelection(
  departments: readonly Department[],
  department: Department,
  assign: boolean,
): Department[] {
  const selectedDepartments = new Set(departments);

  return DEPARTMENTS.filter((value) => (value === department ? assign : selectedDepartments.has(value)));
}
