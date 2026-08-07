import {
  getRolePermissions,
  permissionDescriptions,
  permissionLabels,
  roleDescriptions,
  roleLabels,
} from '@pkg/domain';
import { APP_PERMISSIONS, APP_ROLES, type AppPermission, type AppRole } from '@pkg/schema';
import { IconCheck, IconHelpCircle, IconMinus } from '@tabler/icons-react';
import { type ColumnDef, getCoreRowModel, getFilteredRowModel, useReactTable } from '@tanstack/react-table';
import type React from 'react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';

import { DataTable } from '@/components/data-table/DataTable.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';

type PermissionRow = { permission: AppPermission };

const permissionsByRole = new Map<AppRole, ReadonlySet<AppPermission>>(
  APP_ROLES.map((role) => [role, new Set(getRolePermissions(role))]),
);
const permissionRows: PermissionRow[] = APP_PERMISSIONS.map((permission) => ({ permission }));

export const usePermissionMatrixStore = createPersistedDataTableStore({
  persistName: 'permission-matrix',
  persistVersion: 1,
});

/**
 * Read-only view of the role/permission grid, derived from `appRoleAccess` at render rather than
 * stored, so it cannot drift from what the server actually enforces.
 */
export const PermissionMatrix: React.FC = () => {
  const { globalFilter, setGlobalFilter } = usePermissionMatrixStore(
    useShallow((state) => ({
      globalFilter: state.globalFilter,
      setGlobalFilter: state.setGlobalFilter,
    })),
  );

  const columns = useMemo<ColumnDef<PermissionRow>[]>(
    () => [
      {
        accessorKey: 'permission',
        cell: ({ row }) => <PermissionCell permission={row.original.permission} />,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Permission',
        meta: { headerClassName: 'min-w-80' },
      },
      ...APP_ROLES.map<ColumnDef<PermissionRow>>((role) => ({
        cell: ({ row }) => {
          const granted = permissionsByRole.get(role)?.has(row.original.permission) ?? false;
          const label = `${roleLabels[role]}: ${permissionLabels[row.original.permission]} ${granted ? 'granted' : 'not granted'}`;

          return granted ? (
            <IconCheck aria-label={label} className="mx-auto text-primary" size={18} />
          ) : (
            <IconMinus aria-label={label} className="mx-auto text-muted-foreground/50" size={18} />
          );
        },
        enableColumnFilter: false,
        enableSorting: false,
        header: () => <span title={roleDescriptions[role]}>{roleLabels[role]}</span>,
        id: role,
        meta: { cellClassName: 'text-center', headerClassName: 'min-w-32 whitespace-normal' },
      })),
    ],
    [],
  );

  const table = useReactTable({
    columns,
    data: permissionRows,
    getCoreRowModel: getCoreRowModel(),
    getFilteredRowModel: getFilteredRowModel(),
    globalFilterFn: permissionGlobalFilter,
    onGlobalFilterChange: setGlobalFilter,
    state: { globalFilter },
  });

  return (
    <DataTable
      emptyMessage="No permissions match that search."
      globalFilterPlaceholder="Search permissions..."
      paginationMode="complete"
      table={table}
      tableClassName="min-w-5xl"
      total={table.getFilteredRowModel().rows.length}
      totalLabel={(value) => `${value} ${value === 1 ? 'permission' : 'permissions'}`}
    />
  );
};

/**
 * The description carries the meaning, so it takes the line under the name and truncates to keep
 * every row one height; the code stays reachable behind the icon for anyone matching a grant to code.
 */
const PermissionCell: React.FC<{ permission: AppPermission }> = ({ permission }) => (
  <div className="flex max-w-md flex-col">
    <span className="flex items-center gap-1 font-medium">
      {permissionLabels[permission]}
      <Tooltip>
        <TooltipTrigger
          render={
            <button
              aria-label={`Permission code for ${permissionLabels[permission]}`}
              className="text-muted-foreground hover:text-foreground"
              type="button"
            />
          }
        >
          <IconHelpCircle size={14} />
        </TooltipTrigger>
        <TooltipContent className="font-mono">{permission}</TooltipContent>
      </Tooltip>
    </span>
    <Tooltip>
      <TooltipTrigger render={<span className="block truncate text-xs text-muted-foreground" />}>
        {permissionDescriptions[permission]}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{permissionDescriptions[permission]}</TooltipContent>
    </Tooltip>
  </div>
);

function permissionGlobalFilter(row: { original: PermissionRow }, _columnId: string, filterValue: unknown) {
  const search = String(filterValue ?? '')
    .trim()
    .toLowerCase();

  if (!search) {
    return true;
  }

  return [
    row.original.permission,
    permissionLabels[row.original.permission],
    permissionDescriptions[row.original.permission],
    ...APP_ROLES.filter((role) => permissionsByRole.get(role)?.has(row.original.permission)).map(
      (role) => roleLabels[role],
    ),
  ].some((value) => value.toLowerCase().includes(search));
}
