import { departmentLabels, roleLabels } from '@pkg/domain';
import { type AuthId, UserSortBy, type UserSummary } from '@pkg/schema';
import { IconDeviceTablet } from '@tabler/icons-react';
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import type React from 'react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { DataTable } from '@/components/data-table/DataTable.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import { constrainSorting, type SortOptions } from '@/components/data-table/table-state.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Badge } from '@/components/ui/badge.js';

type UserTableProps = {
  currentUserId: AuthId | undefined;
  errorMessage: string | undefined;
  isLoading: boolean;
  users: UserSummary[];
  onEditUser: ((user: UserSummary) => void) | undefined;
};

type UserTableSortInput = {
  sortBy: UserSortBy;
};

export const useUserTableStore = createPersistedDataTableStore({
  initialState: {
    sorting: [
      {
        id: 'name',
        desc: false,
      },
    ],
  },
  persistName: 'users-table',
  persistVersion: 3,
});

const userSortOptions: SortOptions<UserTableSortInput> = {
  allowedSortIds: UserSortBy.options,
  defaultSort: {
    id: 'name',
  },
};

export const UserTable: React.FC<UserTableProps> = ({ currentUserId, errorMessage, isLoading, onEditUser, users }) => {
  const { columnFilters, globalFilter, setColumnFilters, setGlobalFilter, setSorting, sorting } = useUserTableStore(
    useShallow((state) => ({
      columnFilters: state.columnFilters,
      globalFilter: state.globalFilter,
      setColumnFilters: state.setColumnFilters,
      setGlobalFilter: state.setGlobalFilter,
      setSorting: state.setSorting,
      sorting: state.sorting,
    })),
  );
  const columns = useMemo<ColumnDef<UserSummary>[]>(() => {
    const tableColumns: ColumnDef<UserSummary>[] = [
      {
        accessorKey: 'name',
        cell: ({ row }) => (
          <UserNameCell
            isCurrentUser={currentUserId === row.original.id}
            isDevice={row.original.isDevice}
            name={row.original.name}
            thumbnailDataUrl={row.original.thumbnailDataUrl}
          />
        ),
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Full Name',
      },
      {
        accessorKey: 'role',
        cell: ({ row }) => <span>{roleLabels[row.original.role]}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        filterFn: userRoleFilter,
        header: 'Role',
      },
      {
        accessorKey: 'departments',
        cell: ({ row }) => <DepartmentList departments={row.original.departments} />,
        enableColumnFilter: true,
        enableSorting: false,
        filterFn: userDepartmentsFilter,
        header: 'Departments',
      },
      {
        accessorKey: 'emailVerified',
        cell: ({ row }) => <span>{row.original.emailVerified ? 'Verified' : 'Unverified'}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        filterFn: userEmailVerifiedFilter,
        header: 'Email status',
      },
    ];

    return tableColumns;
  }, [currentUserId]);

  const constrainedSorting = useMemo(() => constrainSorting(sorting, userSortOptions), [sorting]);

  const table = useReactTable({
    columns,
    data: users,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: userGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      globalFilter,
      sorting: constrainedSorting,
    },
  });

  const total = table.getFilteredRowModel().rows.length;

  return (
    <DataTable
      emptyMessage="No users found."
      errorMessage={errorMessage}
      getRowAriaLabel={onEditUser ? (user) => `Edit ${user.name}` : undefined}
      globalFilterPlaceholder="Search users..."
      isLoading={isLoading}
      onRowClick={onEditUser}
      paginationMode="complete"
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'user' : 'users'}`}
    />
  );
};

type UserNameCellProps = {
  isCurrentUser: boolean;
  isDevice: boolean;
  name: string;
  thumbnailDataUrl?: string | null;
};

/**
 * A device gets an icon where a person gets a face. Nobody is behind the account, so a thumbnail —
 * or the initials one falls back to — would read as a colleague nobody can place.
 */
const UserNameCell: React.FC<UserNameCellProps> = ({ isCurrentUser, isDevice, name, thumbnailDataUrl }) => (
  <div className="flex items-center gap-2 font-medium">
    {isDevice ? (
      <span className="flex size-8 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
        <IconDeviceTablet size={18} />
      </span>
    ) : (
      <EntityThumbnail label={name} size="sm" thumbnailDataUrl={thumbnailDataUrl} />
    )}
    <span>{name}</span>
    {isDevice ? <Badge variant="secondary">Device</Badge> : null}
    {isCurrentUser ? <Badge variant="outline">You</Badge> : null}
  </div>
);

function userGlobalFilter(row: { original: UserSummary }, _columnId: string, filterValue: unknown) {
  const search = normalizeFilterValue(filterValue);

  if (!search) {
    return true;
  }

  return [
    row.original.name,
    row.original.role,
    roleLabels[row.original.role],
    ...row.original.departments.map((department) => departmentLabels[department]),
    row.original.emailVerified ? 'verified' : 'unverified',
  ].some((value) => value.toLowerCase().includes(search));
}

function userRoleFilter(row: { original: UserSummary }, _columnId: string, filterValue: unknown) {
  const search = normalizeFilterValue(filterValue);

  if (!search) {
    return true;
  }

  return [row.original.role, roleLabels[row.original.role]].some((value) => value.toLowerCase().includes(search));
}

function userEmailVerifiedFilter(row: { original: UserSummary }, _columnId: string, filterValue: unknown) {
  const search = normalizeFilterValue(filterValue);

  if (!search) {
    return true;
  }

  return (row.original.emailVerified ? 'verified' : 'unverified').includes(search);
}

function userDepartmentsFilter(row: { original: UserSummary }, _columnId: string, filterValue: unknown) {
  const search = normalizeFilterValue(filterValue);

  if (!search) {
    return true;
  }

  return row.original.departments.some((department) =>
    [department, departmentLabels[department]].some((value) => value.toLowerCase().includes(search)),
  );
}

const DepartmentList: React.FC<{ departments: UserSummary['departments'] }> = ({ departments }) => {
  if (departments.length === 0) {
    return <span className="text-muted-foreground">None</span>;
  }

  return <span>{departments.map((department) => departmentLabels[department]).join(', ')}</span>;
};

function normalizeFilterValue(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}
