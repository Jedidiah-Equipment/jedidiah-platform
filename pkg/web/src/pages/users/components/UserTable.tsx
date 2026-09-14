import { getBusinessRole, roleLabels } from '@pkg/domain';
import { type AppRole, type AuthId, type Business, type UserAccount, UserSortBy } from '@pkg/schema';
import { IconDeviceTablet } from '@tabler/icons-react';
import type React from 'react';
import { useCallback, useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import { constrainSorting, type SortOptions } from '@/components/data-table/table-state.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Badge } from '@/components/ui/badge.js';

type UserTableProps = {
  business: Business;
  currentUserId: AuthId | undefined;
  errorMessage: string | undefined;
  /** The business's own columns, placed between the role and the email status. */
  extraColumns: DataTableColumnDef<UserAccount>[];
  extraSearchTerms: (user: UserAccount) => string[];
  isLoading: boolean;
  users: UserAccount[];
  onEditUser: ((user: UserAccount) => void) | undefined;
};

type UserTableSortInput = {
  sortBy: UserSortBy;
};

function createUserTableStore(business: Business) {
  return createPersistedDataTableStore({
    initialState: {
      sorting: [
        {
          id: 'name',
          desc: false,
        },
      ],
    },
    persistName: `users-table-${business}`,
    persistVersion: 4,
  });
}

/** One store per business: a Role filter typed in Equipment must not empty the Contracting table. */
export const userTableStores = {
  contracting: createUserTableStore('contracting'),
  equipment: createUserTableStore('equipment'),
} as const satisfies Record<Business, unknown>;

const userSortOptions: SortOptions<UserTableSortInput> = {
  allowedSortIds: UserSortBy.options,
  defaultSort: {
    id: 'name',
  },
};

/**
 * One business's user admin: the role column reads the slot for the business the table stands in,
 * so a super-admin reads as such in both while everyone else reads the one role they hold here.
 */
export const UserTable: React.FC<UserTableProps> = ({
  business,
  currentUserId,
  errorMessage,
  extraColumns,
  extraSearchTerms,
  isLoading,
  onEditUser,
  users,
}) => {
  const useUserTableStore = userTableStores[business];
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
  const columns = useMemo<DataTableColumnDef<UserAccount>[]>(
    () => [
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
        id: 'role',
        accessorFn: (user) => getBusinessRole(user, business),
        cell: ({ row }) => <span>{formatRole(getBusinessRole(row.original, business))}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        filterFn: (row, _columnId, filterValue) => {
          const search = normalizeFilterValue(filterValue);
          const role = getBusinessRole(row.original, business);

          return !search || [role ?? '', formatRole(role)].some((value) => value.toLowerCase().includes(search));
        },
        header: 'Role',
      },
      ...extraColumns,
      {
        accessorKey: 'emailVerified',
        cell: ({ row }) => <span>{row.original.emailVerified ? 'Verified' : 'Unverified'}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        filterFn: userEmailVerifiedFilter,
        header: 'Email status',
      },
    ],
    [business, currentUserId, extraColumns],
  );

  const globalFilterFn = useCallback(
    (row: { original: UserAccount }, _columnId: string, filterValue: unknown) => {
      const search = normalizeFilterValue(filterValue);

      if (!search) {
        return true;
      }

      const role = getBusinessRole(row.original, business);

      return [
        row.original.name,
        role ?? '',
        formatRole(role),
        ...extraSearchTerms(row.original),
        row.original.emailVerified ? 'verified' : 'unverified',
      ].some((value) => value.toLowerCase().includes(search));
    },
    [business, extraSearchTerms],
  );

  const constrainedSorting = useMemo(() => constrainSorting(sorting, userSortOptions), [sorting]);

  const table = useDataTable({
    columns,
    data: users,
    enableSortingRemoval: false,
    globalFilterFn,
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
export const UserNameCell: React.FC<UserNameCellProps> = ({ isCurrentUser, isDevice, name, thumbnailDataUrl }) => (
  <div className="flex items-center gap-2 font-medium">
    {isDevice ? (
      <span className="flex size-6 shrink-0 items-center justify-center rounded-md border bg-muted text-muted-foreground">
        <IconDeviceTablet size={14} />
      </span>
    ) : (
      <EntityThumbnail label={name} size="sm" thumbnailDataUrl={thumbnailDataUrl} />
    )}
    <span>{name}</span>
    {isDevice ? <Badge variant="secondary">Device</Badge> : null}
    {isCurrentUser ? <Badge variant="outline">You</Badge> : null}
  </div>
);

function formatRole(role: AppRole | null): string {
  return role ? roleLabels[role] : 'No access';
}

function userEmailVerifiedFilter(row: { original: UserAccount }, _columnId: string, filterValue: unknown) {
  const search = normalizeFilterValue(filterValue);

  if (!search) {
    return true;
  }

  return (row.original.emailVerified ? 'verified' : 'unverified').includes(search);
}

export function normalizeFilterValue(value: unknown): string {
  return String(value ?? '')
    .trim()
    .toLowerCase();
}
