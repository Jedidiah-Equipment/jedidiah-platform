import { DEPARTMENTS, type Department } from '@pkg/schema';
import type React from 'react';
import { useEffect, useState } from 'react';

import { Checkbox } from '@/components/ui/checkbox.js';
import { Field, FieldContent, FieldGroup, FieldLabel } from '@/components/ui/field.js';
import { departmentLabels } from './department-labels.js';

type UserDepartmentsFormProps = {
  initialDepartments: readonly Department[];
  isPending: boolean;
  onDepartmentsChange: (departments: readonly Department[]) => Promise<unknown>;
};

export const UserDepartmentsForm: React.FC<UserDepartmentsFormProps> = ({
  initialDepartments,
  isPending,
  onDepartmentsChange,
}) => {
  const [departments, setDepartments] = useState<Department[]>(() => [...initialDepartments]);

  useEffect(() => {
    setDepartments([...initialDepartments]);
  }, [initialDepartments]);

  const selectedDepartments = new Set(departments);

  const toggleDepartment = async (department: Department, assign: boolean) => {
    const previousDepartments = departments;
    const nextDepartments = assign
      ? departments.includes(department)
        ? departments
        : [...departments, department]
      : departments.filter((value) => value !== department);

    setDepartments(nextDepartments);

    try {
      await onDepartmentsChange(nextDepartments);
    } catch {
      setDepartments(previousDepartments);
    }
  };

  return (
    <FieldGroup>
      {DEPARTMENTS.map((department) => {
        const checked = selectedDepartments.has(department);

        return (
          <Field data-disabled={isPending} key={department} orientation="horizontal">
            <Checkbox
              checked={checked}
              disabled={isPending}
              id={`department-${department}`}
              onCheckedChange={(value) => void toggleDepartment(department, value === true)}
            />
            <FieldContent>
              <FieldLabel htmlFor={`department-${department}`}>{departmentLabels[department]}</FieldLabel>
            </FieldContent>
          </Field>
        );
      })}
    </FieldGroup>
  );
};
