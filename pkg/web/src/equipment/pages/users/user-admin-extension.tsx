import { hasPermission } from '@pkg/domain';
import { departmentLabels } from '@pkg/domain/equipment';
import type { AuthId, UserAccount } from '@pkg/schema';
import type { Department } from '@pkg/schema/equipment';
import { useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import { normalizeFilterValue } from '@/pages/users/components/UserTable.js';
import type { UserAdminExtension } from '@/pages/users/user-admin-extension.js';
import { UserBadgePrintButton } from './components/UserBadgePrintButton.js';
import { UserDepartmentsForm } from './components/UserDepartmentsForm.js';

const noDepartments: readonly Department[] = [];

function useDepartmentMemberships() {
  const trpc = useTRPC();
  const query = useQuery(trpc.userDepartments.list.queryOptions());

  return useMemo(
    () => new Map(query.data?.memberships.map((membership) => [membership.userId, membership.departments])),
    [query.data],
  );
}

/** Equipment's side of user admin: Department Membership on the table and forms, and the stores badge. */
export const equipmentUserAdminExtension: UserAdminExtension = {
  useTableExtension: () => {
    const memberships = useDepartmentMemberships();
    const columns = useMemo<DataTableColumnDef<UserAccount>[]>(
      () => [
        {
          id: 'departments',
          accessorFn: (user) => memberships.get(user.id) ?? noDepartments,
          cell: ({ row }) => <DepartmentList departments={memberships.get(row.original.id) ?? noDepartments} />,
          enableColumnFilter: true,
          enableSorting: false,
          filterFn: (row, _columnId, filterValue) => {
            const search = normalizeFilterValue(filterValue);

            return (
              !search ||
              (memberships.get(row.original.id) ?? noDepartments).some((department) =>
                [department, departmentLabels[department]].some((value) => value.toLowerCase().includes(search)),
              )
            );
          },
          header: 'Departments',
        },
      ],
      [memberships],
    );
    const searchTerms = useCallback(
      (user: UserAccount) =>
        (memberships.get(user.id) ?? noDepartments).map((department) => departmentLabels[department]),
      [memberships],
    );

    return { columns, searchTerms };
  },
  useFormExtension: ({ isPending, user }) => {
    const trpc = useTRPC();
    const { invalidateUserDepartments } = useQueryInvalidation();
    const canAssignDepartments = hasPermission(useAccess().data, 'user:update');
    const canSetRole = hasPermission(useAccess().data, 'user:set-role');
    const memberships = useDepartmentMemberships();
    const initialDepartments = (user && memberships.get(user.id)) ?? noDepartments;
    const [draft, setDraft] = useState<readonly Department[] | null>(null);
    const setDepartmentsMutation = useMutation(trpc.userDepartments.set.mutationOptions());

    // A fresh user means a fresh draft; the stored memberships stay the baseline until touched.
    // biome-ignore lint/correctness/useExhaustiveDependencies: reset on the user, not on every membership refetch
    useEffect(() => setDraft(null), [user?.id]);

    const departments = draft ?? initialDepartments;
    const save = useCallback(
      async (userId: AuthId) => {
        if (!canAssignDepartments || draft === null || haveDepartmentsChanged(draft, initialDepartments) === false) {
          return false;
        }

        await setDepartmentsMutation.mutateAsync({ departments: [...draft], userId });
        await invalidateUserDepartments();

        return true;
      },
      [canAssignDepartments, draft, initialDepartments, invalidateUserDepartments, setDepartmentsMutation],
    );

    return {
      actions:
        user && canSetRole && user.equipmentRole === 'stores' && !user.isDevice ? (
          <UserBadgePrintButton userId={user.id} />
        ) : null,
      fields: canAssignDepartments ? (
        <UserDepartmentsForm initialDepartments={departments} isPending={isPending} onDepartmentsChange={setDraft} />
      ) : null,
      save,
    };
  },
};

const DepartmentList: React.FC<{ departments: readonly Department[] }> = ({ departments }) => {
  if (departments.length === 0) {
    return <span className="text-muted-foreground">None</span>;
  }

  return <span>{departments.map((department) => departmentLabels[department]).join(', ')}</span>;
};

function haveDepartmentsChanged(left: readonly Department[], right: readonly Department[]) {
  if (left.length !== right.length) {
    return true;
  }

  const rightDepartments = new Set(right);
  return left.some((department) => !rightDepartments.has(department));
}
