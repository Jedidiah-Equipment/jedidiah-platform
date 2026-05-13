import type { AppRole, AuthId, UserSummary } from "@pkg/schema";
import {
  type ColumnDef,
  getCoreRowModel,
  getFilteredRowModel,
  getPaginationRowModel,
  getSortedRowModel,
  useReactTable,
} from "@tanstack/react-table";
import type React from "react";
import { useMemo } from "react";
import { useShallow } from "zustand/react/shallow";

import { DataTable } from "@/components/data-table/DataTable.js";
import {
  useConstrainedPageIndex,
  useConstrainedTableState,
} from "@/components/data-table/hooks/use-constrained-table-state.js";
import { createPersistedDataTableStore } from "@/components/data-table/store.js";
import { getPageCount, type SortOptions } from "@/components/data-table/table-state.js";
import { Badge } from "@/components/ui/badge.js";
import { roleLabels } from "./role-labels.js";
import { UserRoleSelect } from "./UserRoleSelect.js";

type UserTableProps = {
  currentUserId: AuthId | undefined;
  errorMessage: string | undefined;
  isLoading: boolean;
  isRoleUpdatePending: boolean;
  users: UserSummary[];
  onRoleChange: (userId: AuthId, role: AppRole) => void;
};

type UserTableSortBy = keyof Pick<UserSummary, "email" | "name" | "role">;

type UserTableSortInput = {
  sortBy: UserTableSortBy;
};

export const useUserTableStore = createPersistedDataTableStore({
  initialState: {
    sorting: [
      {
        id: "email",
        desc: false,
      },
    ],
  },
  persistName: "users-table",
});

const userSortOptions: SortOptions<UserTableSortInput> = {
  allowedSortIds: ["name", "email", "role"],
  defaultSort: {
    id: "email",
  },
};

export const UserTable: React.FC<UserTableProps> = ({
  currentUserId,
  errorMessage,
  isLoading,
  isRoleUpdatePending,
  onRoleChange,
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

  const columns = useMemo<ColumnDef<UserSummary>[]>(
    () => [
      {
        accessorKey: "name",
        cell: ({ row }) => (
          <UserNameCell
            isCurrentUser={currentUserId === row.original.id}
            name={row.original.name}
          />
        ),
        enableColumnFilter: true,
        enableSorting: true,
        header: "Name",
      },
      {
        accessorKey: "email",
        cell: ({ row }) => <span className="text-muted-foreground">{row.original.email}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: "Email",
      },
      {
        accessorKey: "role",
        cell: ({ row }) => {
          const isCurrentUser = currentUserId === row.original.id;

          return (
            <UserRoleSelect
              disabled={isRoleUpdatePending || isCurrentUser}
              onRoleChange={(role) => onRoleChange(row.original.id, role)}
              value={row.original.role}
            />
          );
        },
        enableColumnFilter: true,
        enableSorting: true,
        filterFn: userRoleFilter,
        header: "Role",
        meta: {
          headerClassName: "w-56",
        },
      },
    ],
    [currentUserId, isRoleUpdatePending, onRoleChange],
  );

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
      totalLabel={(value) => `${value} ${value === 1 ? "user" : "users"}`}
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
  ].some((value) => value.toLowerCase().includes(search));
}

function userRoleFilter(row: { original: UserSummary }, _columnId: string, filterValue: unknown) {
  const search = normalizeFilterValue(filterValue);

  if (!search) {
    return true;
  }

  return [row.original.role, roleLabels[row.original.role]].some((value) =>
    value.toLowerCase().includes(search),
  );
}

function normalizeFilterValue(value: unknown): string {
  return String(value ?? "")
    .trim()
    .toLowerCase();
}
