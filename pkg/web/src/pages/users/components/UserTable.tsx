import { roleLabels } from '@pkg/domain';
import type { AuthId, UserSummary } from '@pkg/schema';
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from '@tanstack/react-table';
import { PencilIcon } from 'lucide-react';
import type React from 'react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { DataTable } from '@/components/data-table/DataTable.js';
import {
  useConstrainedPageIndex,
  useConstrainedTableState,
} from '@/components/data-table/hooks/use-constrained-table-state.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import { getPageCount, type SortOptions } from '@/components/data-table/table-state.js';
import { DepartmentIcon } from '@/components/departments/index.js';
import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import { departmentLabels } from './department-labels.js';

type UserTableProps = {
  currentUserId: AuthId | undefined;
  errorMessage: string | undefined;
  isLoading: boolean;
  showEditActions: boolean;
  users: UserSummary[];
  onEditUser: ((user: UserSummary) => void) | undefined;
};

type UserTableSortBy = keyof Pick<UserSummary, 'email' | 'emailVerified' | 'name' | 'role'>;

type UserTableSortInput = {
  sortBy: UserTableSortBy;
};

export const useUserTableStore = createPersistedDataTableStore({
  initialState: {
    sorting: [
      {
        id: 'email',
        desc: false,
      },
    ],
  },
  persistName: 'users-table',
});

const userSortOptions: SortOptions<UserTableSortInput> = {
  allowedSortIds: ['name', 'email', 'role', 'emailVerified'],
  defaultSort: {
    id: 'email',
  },
};

export const UserTable: React.FC<UserTableProps> = ({
  currentUserId,
  errorMessage,
  isLoading,
  onEditUser,
  showEditActions,
  users,
}) => {
  const {
    columnFilters,
    globalFilter,
    pagination,
    setColumnFilters,
    setGlobalFilter,
    setPageIndex,
    setPagination,
    setSorting,
    sorting,
  } = useUserTableStore(
    useShallow((state) => ({
      columnFilters: state.columnFilters,
      globalFilter: state.globalFilter,
      pagination: state.pagination,
      setColumnFilters: state.setColumnFilters,
      setGlobalFilter: state.setGlobalFilter,
      setPageIndex: state.setPageIndex,
      setPagination: state.setPagination,
      setSorting: state.setSorting,
      sorting: state.sorting,
    })),
  );

  const columns = useMemo<ColumnDef<UserSummary>[]>(() => {
    const tableColumns: ColumnDef<UserSummary>[] = [
      {
        accessorKey: 'name',
        cell: ({ row }) => <UserNameCell isCurrentUser={currentUserId === row.original.id} name={row.original.name} />,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Full Name',
      },
      {
        accessorKey: 'email',
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Email',
      },
      {
        accessorKey: 'role',
        cell: ({ row }) => <Badge variant="outline">{roleLabels[row.original.role]}</Badge>,
        enableColumnFilter: true,
        enableSorting: true,
        filterFn: userRoleFilter,
        header: 'Role',
      },
      {
        accessorKey: 'departments',
        cell: ({ row }) => <DepartmentBadges departments={row.original.departments} />,
        enableColumnFilter: true,
        enableSorting: false,
        filterFn: userDepartmentsFilter,
        header: 'Departments',
      },
      {
        accessorKey: 'emailVerified',
        cell: ({ row }) => (
          <Badge variant={row.original.emailVerified ? 'secondary' : 'outline'}>
            {row.original.emailVerified ? 'Verified' : 'Unverified'}
          </Badge>
        ),
        enableColumnFilter: true,
        enableSorting: true,
        filterFn: userEmailVerifiedFilter,
        header: 'Email status',
      },
    ];

    if (showEditActions && onEditUser) {
      tableColumns.push({
        id: 'actions',
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              aria-label={`Edit ${row.original.name}`}
              onClick={() => onEditUser(row.original)}
              size="icon-sm"
              variant="outline"
            >
              <PencilIcon />
            </Button>
          </div>
        ),
        enableColumnFilter: false,
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        meta: {
          cellClassName: 'text-right',
          headerClassName: 'w-20 text-right',
        },
      });
    }

    return tableColumns;
  }, [currentUserId, onEditUser, showEditActions]);

  const tableState = useConstrainedTableState({
    pagination,
    sorting,
    sortOptions: userSortOptions,
    total: users.length,
  });

  const table = useReactTable({
    autoResetPageIndex: false,
    columns,
    data: users,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    getSortedRowModel: getSortedRowModel(),
    globalFilterFn: userGlobalFilter,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    state: {
      columnFilters,
      globalFilter,
      pagination: tableState.pagination,
      sorting: tableState.sorting,
    },
  });

  const total = table.getFilteredRowModel().rows.length;
  const pageCount = getPageCount(total, pagination.pageSize);

  useConstrainedPageIndex({ pageCount, pagination, setPageIndex });

  return (
    <DataTable
      emptyMessage="No users found."
      errorMessage={errorMessage}
      globalFilterPlaceholder="Search users..."
      isLoading={isLoading}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? 'user' : 'users'}`}
    />
  );
};

type UserNameCellProps = {
  isCurrentUser: boolean;
  name: string;
};

const UserNameCell: React.FC<UserNameCellProps> = ({ isCurrentUser, name }) => (
  <div className="flex items-center gap-2 font-medium">
    <span>{name}</span>
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
    row.original.email,
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

const DepartmentBadges: React.FC<{ departments: UserSummary['departments'] }> = ({ departments }) => {
  if (departments.length === 0) {
    return <span className="text-muted-foreground">None</span>;
  }

  return (
    <div className="flex flex-wrap gap-1">
      {departments.map((department) => (
        <Badge key={department} variant="secondary">
          <DepartmentIcon department={department} />
          {departmentLabels[department]}
        </Badge>
      ))}
    </div>
  );
};

function normalizeFilterValue(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}
