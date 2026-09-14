import { getBusinessRole, roleLabels } from '@pkg/domain';
import {
  type AppRole,
  type AuthId,
  type Business,
  type UserAccount,
  type UserListInput,
  UserSortBy,
} from '@pkg/schema';
import { IconDeviceTablet } from '@tabler/icons-react';
import type { ColumnFiltersState } from '@tanstack/react-table';
import type React from 'react';
import { useMemo } from 'react';
import { useCombinedCursorQueryPages } from '@/components/data-table/cursor-query.js';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { useServerSideTableController } from '@/components/data-table/hooks/use-server-side-table-controller.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import type { SortOptions } from '@/components/data-table/table-state.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { Badge } from '@/components/ui/badge.js';
import { getApiQueryErrorMessage } from '@/lib/api-errors.js';
import type { UserAdminExtension } from '../user-admin-extension.js';

type UserTableProps = {
  business: Business;
  currentUserId: AuthId | undefined;
  /** The business's own columns, placed between the role and the email status. */
  extraColumns: DataTableColumnDef<UserAccount>[];
  useListQuery: UserAdminExtension['useListQuery'];
  onEditUser: ((user: UserAccount) => void) | undefined;
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

const userSortOptions: SortOptions<UserListInput> = {
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
  extraColumns,
  useListQuery,
  onEditUser,
}) => {
  const tableController = useServerSideTableController({
    store: userTableStores[business],
    sortOptions: userSortOptions,
    getListInputExtras: getUserListInputExtras,
  });
  const usersQuery = useListQuery({ ...tableController.listInput, business }, tableController.columnFilters);
  const { items: users, total } = useCombinedCursorQueryPages(usersQuery.data?.pages);
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
        header: 'Role',
      },
      ...extraColumns,
      {
        accessorKey: 'emailVerified',
        cell: ({ row }) => <span>{row.original.emailVerified ? 'Verified' : 'Unverified'}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: 'Email status',
      },
    ],
    [business, currentUserId, extraColumns],
  );

  const table = useDataTable({
    columns,
    data: users,
    enableSortingRemoval: false,
    manualFiltering: true,
    manualSorting: true,
    onColumnFiltersChange: tableController.setColumnFilters,
    onGlobalFilterChange: tableController.setGlobalFilter,
    onSortingChange: tableController.setSorting,
    state: {
      columnFilters: tableController.columnFilters,
      globalFilter: tableController.globalFilter,
      sorting: tableController.sorting,
    },
  });

  return (
    <DataTable
      emptyMessage="No users found."
      errorMessage={getApiQueryErrorMessage(usersQuery.error, 'Unable to load users.')}
      getRowAriaLabel={onEditUser ? (user) => `Edit ${user.name}` : undefined}
      globalFilterPlaceholder="Search users..."
      isLoading={usersQuery.isPending}
      onRowClick={onEditUser}
      paginationMode="cursor"
      loadMore={{
        hasNextPage: usersQuery.hasNextPage,
        isFetchingNextPage: usersQuery.isFetchingNextPage,
        loadedCount: users.length,
        onLoadMore: () => void usersQuery.fetchNextPage(),
      }}
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

function getUserListInputExtras(columnFilters: ColumnFiltersState) {
  const textFilter = (id: string) => {
    const value = columnFilters.find((filter) => filter.id === id)?.value;
    return typeof value === 'string' && value ? value : undefined;
  };
  return {
    columnFilters: {
      name: textFilter('name'),
      role: textFilter('role'),
      emailVerified: textFilter('emailVerified'),
    },
  } satisfies Pick<UserListInput, 'columnFilters'>;
}
