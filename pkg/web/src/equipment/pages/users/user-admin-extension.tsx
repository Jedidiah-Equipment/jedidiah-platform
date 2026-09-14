import { hasPermission } from '@pkg/domain';
import { departmentLabels } from '@pkg/domain/equipment';
import type { AuthId, UserAccount } from '@pkg/schema';
import type { Department } from '@pkg/schema/equipment';
import { keepPreviousData, useInfiniteQuery, useMutation, useQuery } from '@tanstack/react-query';
import { useCallback, useEffect, useMemo, useState } from 'react';

import { cursorInfiniteQueryOptions } from '@/components/data-table/cursor-query.js';
import type { DataTableColumnDef } from '@/components/data-table/features.js';
import { useQueryInvalidation } from '@/equipment/hooks/use-query-invalidation.js';
import { useAccess } from '@/hooks/use-access.js';
import { useTRPC } from '@/lib/trpc.js';
import type { UserAdminExtension } from '@/pages/users/user-admin-extension.js';
import { UserBadgePrintButton } from './components/UserBadgePrintButton.js';
import { UserDepartmentsForm } from './components/UserDepartmentsForm.js';

const noDepartments: readonly Department[] = [];

function useDepartmentMemberships() {
  const trpc = useTRPC();
  const query = useQuery(trpc.userDepartments.list.queryOptions());
  const memberships = useMemo(
    () => new Map(query.data?.memberships.map((membership) => [membership.userId, membership.departments])),
    [query.data],
  );

  return { isError: query.isError, isLoaded: query.isSuccess, memberships };
}

/** Equipment's side of user admin: Department Membership on the table and forms, and the stores badge. */
export const equipmentUserAdminExtension: UserAdminExtension = {
  useListQuery: (input, columnFilters) => {
    const trpc = useTRPC();
    const department = columnFilters.find((filter) => filter.id === 'departments')?.value;
    return useInfiniteQuery(
      trpc.userDepartments.listUsers.infiniteQueryOptions(
        {
          ...input,
          department: typeof department === 'string' ? department : undefined,
        },
        {
          ...cursorInfiniteQueryOptions,
          placeholderData: keepPreviousData,
        },
      ),
    );
  },
  useInvalidateAdditionalUserQueries: () => useQueryInvalidation().invalidateUserDepartments,
  useTableExtension: () => {
    const { isError, isLoaded, memberships } = useDepartmentMemberships();
    const columns = useMemo<DataTableColumnDef<UserAccount>[]>(
      () => [
        {
          id: 'departments',
          accessorFn: (user) => memberships.get(user.id) ?? noDepartments,
          cell: ({ row }) => (
            <DepartmentList
              departments={memberships.get(row.original.id) ?? noDepartments}
              state={isError ? 'error' : isLoaded ? 'loaded' : 'loading'}
            />
          ),
          enableColumnFilter: true,
          enableSorting: false,
          header: 'Departments',
        },
      ],
      [isError, isLoaded, memberships],
    );
    return { columns };
  },
  useFormExtension: ({ isPending, user }) => {
    const trpc = useTRPC();
    const { invalidateUserDepartments } = useQueryInvalidation();
    const access = useAccess().data;
    const canAssignDepartments = hasPermission(access, 'user:update');
    const canSetRole = hasPermission(access, 'user:set-role');
    const { isError, isLoaded, memberships } = useDepartmentMemberships();
    const initialDepartments = (user && memberships.get(user.id)) ?? noDepartments;
    const [draft, setDraft] = useState<readonly Department[] | null>(null);
    const setDepartmentsMutation = useMutation(trpc.userDepartments.set.mutationOptions());

    // A fresh user means a fresh draft; the stored memberships stay the baseline until touched.
    // biome-ignore lint/correctness/useExhaustiveDependencies: reset on the user, not on every membership refetch
    useEffect(() => setDraft(null), [user?.id]);

    const departments = draft ?? initialDepartments;
    // The save replaces the whole membership set, so a draft started against an unloaded baseline
    // would silently drop what the user already had: the field stays closed until the baseline is in.
    const canEditDepartments = canAssignDepartments && isLoaded;
    const save = useCallback(
      async (userId: AuthId) => {
        if (!canEditDepartments || draft === null || !haveDepartmentsChanged(draft, initialDepartments)) {
          return false;
        }

        await setDepartmentsMutation.mutateAsync({ departments: [...draft], userId });
        await invalidateUserDepartments();

        return true;
      },
      [canEditDepartments, draft, initialDepartments, invalidateUserDepartments, setDepartmentsMutation],
    );

    return {
      actions:
        user && canSetRole && user.equipmentRole === 'stores' && !user.isDevice ? (
          <UserBadgePrintButton userId={user.id} />
        ) : null,
      fields: canAssignDepartments ? (
        <>
          <UserDepartmentsForm
            initialDepartments={departments}
            isPending={isPending || !isLoaded}
            onDepartmentsChange={setDraft}
          />
          {isError ? <p className="text-destructive text-sm">Unable to load departments.</p> : null}
        </>
      ) : null,
      save,
    };
  },
};

const DepartmentList: React.FC<{ departments: readonly Department[]; state: 'error' | 'loaded' | 'loading' }> = ({
  departments,
  state,
}) => {
  // Missing data must not read as an empty membership: the column says so until the list is in.
  if (state === 'loading') {
    return <span className="text-muted-foreground">Loading…</span>;
  }
  if (state === 'error') {
    return <span className="text-destructive">Unavailable</span>;
  }
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
