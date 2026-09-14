import { permissionDescriptions, permissionLabels, roleDescriptions, roleLabels } from '@pkg/domain';
import type { AppPermission, Business } from '@pkg/schema';
import { IconCheck, IconMinus } from '@tabler/icons-react';
import type React from 'react';
import { useMemo } from 'react';
import { useShallow } from 'zustand/react/shallow';
import { DataTable } from '@/components/data-table/DataTable.js';
import { type DataTableColumnDef, useDataTable } from '@/components/data-table/features.js';
import { createPersistedDataTableStore } from '@/components/data-table/store.js';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';
import { buildPermissionMatrix, type PermissionMatrixModel } from './permission-matrix-model.js';

type PermissionRow = { permission: AppPermission };

export const usePermissionMatrixStore = createPersistedDataTableStore({
  persistName: 'permission-matrix',
  persistVersion: 1,
});

/**
 * Read-only view of one business's role/permission grid, derived from `appRoleAccess` at render
 * rather than stored, so it cannot drift from what the server actually enforces.
 */
export const PermissionMatrix: React.FC<{ business: Business }> = ({ business }) => {
  const { globalFilter, setGlobalFilter } = usePermissionMatrixStore(
    useShallow((state) => ({
      globalFilter: state.globalFilter,
      setGlobalFilter: state.setGlobalFilter,
    })),
  );
  const matrix = useMemo(() => buildPermissionMatrix(business), [business]);
  const permissionRows = useMemo<PermissionRow[]>(
    () => matrix.permissions.map((permission) => ({ permission })),
    [matrix],
  );

  const columns = useMemo<DataTableColumnDef<PermissionRow>[]>(
    () => [
      {
        accessorKey: 'permission',
        cell: ({ row }) => <PermissionCell permission={row.original.permission} />,
        enableColumnFilter: false,
        enableSorting: false,
        header: 'Permission',
        meta: { headerClassName: 'min-w-80' },
      },
      ...matrix.roles.map<DataTableColumnDef<PermissionRow>>((role) => ({
        cell: ({ row }) => {
          const granted = matrix.permissionsByRole.get(role)?.has(row.original.permission) ?? false;
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
    [matrix],
  );

  const table = useDataTable({
    columns,
    data: permissionRows,
    // Rows are a permission against a grid of role icons; only the shared search reads them.
    enableSorting: false,
    globalFilterFn: (row, columnId, filterValue) => permissionGlobalFilter(matrix, row, columnId, filterValue),
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
 * every row one height; the code stays behind the name for anyone matching a grant back to code.
 */
const PermissionCell: React.FC<{ permission: AppPermission }> = ({ permission }) => (
  <div className="flex max-w-md flex-col">
    <Tooltip>
      <TooltipTrigger render={<span className="w-fit font-medium" />}>{permissionLabels[permission]}</TooltipTrigger>
      <TooltipContent className="font-mono">{permission}</TooltipContent>
    </Tooltip>
    <Tooltip>
      <TooltipTrigger render={<span className="block truncate text-xs text-muted-foreground" />}>
        {permissionDescriptions[permission]}
      </TooltipTrigger>
      <TooltipContent className="max-w-xs">{permissionDescriptions[permission]}</TooltipContent>
    </Tooltip>
  </div>
);

function permissionGlobalFilter(
  matrix: PermissionMatrixModel,
  row: { original: PermissionRow },
  _columnId: string,
  filterValue: unknown,
) {
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
    ...matrix.roles
      .filter((role) => matrix.permissionsByRole.get(role)?.has(row.original.permission))
      .map((role) => roleLabels[role]),
  ].some((value) => value.toLowerCase().includes(search));
}
