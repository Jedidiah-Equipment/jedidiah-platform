import { DEPARTMENTS, type Department } from '@pkg/schema';
import type React from 'react';
import { useId } from 'react';

import { DepartmentIcon } from '@/components/departments/index.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { Field, FieldContent, FieldGroup, FieldLabel, FieldLegend, FieldSet } from '@/components/ui/field.js';
import { departmentLabels } from './department-labels.js';

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

  const toggleDepartment = (department: Department, assign: boolean) => {
    const nextDepartments = DEPARTMENTS.filter((value) =>
      value === department ? assign : selectedDepartments.has(value),
    );
    onDepartmentsChange(nextDepartments);
  };

  return (
    <FieldSet>
      <FieldLegend>Departments</FieldLegend>
      <FieldGroup>
        {DEPARTMENTS.map((department) => {
          const checked = selectedDepartments.has(department);
          const id = `${fieldId}-${department}`;

          return (
            <Field data-disabled={isPending} key={department} orientation="horizontal">
              <Checkbox
                checked={checked}
                disabled={isPending}
                id={id}
                onCheckedChange={(value) => toggleDepartment(department, value === true)}
              />
              <FieldContent>
                <FieldLabel htmlFor={id}>
                  <DepartmentIcon className="size-4 text-muted-foreground" department={department} />
                  {departmentLabels[department]}
                </FieldLabel>
              </FieldContent>
            </Field>
          );
        })}
      </FieldGroup>
    </FieldSet>
  );
};
