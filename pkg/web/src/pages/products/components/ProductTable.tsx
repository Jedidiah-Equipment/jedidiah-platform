import type { Product, ProductListInput } from "@pkg/schema";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import {
  type ColumnDef,
  type ColumnFiltersState,
  getCoreRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { PencilIcon } from "lucide-react";
import type React from "react";
import { useEffect, useMemo } from "react";
import { useShallow } from "zustand/react/shallow";
import { DataTable } from "@/components/data-table/DataTable.js";
import { usePagedQueryResult } from "@/components/data-table/hooks/use-paged-query-result.js";
import { createPersistedDataTableStore } from "@/components/data-table/store.js";
import { Button } from "@/components/ui/button.js";
import { useTRPC } from "@/lib/trpc.js";

type ProductTableProps = {
  onEditProduct: (product: Product) => void;
};

export const useProductTableStore = createPersistedDataTableStore({
  initialState: {
    sorting: [
      {
        id: "name",
        desc: false,
      },
    ],
  },
  persistName: "products-table",
});

export const ProductTable: React.FC<ProductTableProps> = ({ onEditProduct }) => {
  const trpc = useTRPC();
  const productListInput = useProductListInput();

  const productsQuery = useQuery(
    trpc.products.list.queryOptions(productListInput, {
      placeholderData: keepPreviousData,
    }),
  );

  const { items: products, total, pageCount, isLoading } = usePagedQueryResult(productsQuery);

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
  } = useProductTableStore(
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

  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      {
        accessorKey: "name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: "Name",
      },
      {
        accessorKey: "id",
        cell: ({ row }) => (
          <span className="block max-w-[240px] truncate font-mono text-xs text-muted-foreground">
            {row.original.id}
          </span>
        ),
        enableColumnFilter: true,
        enableSorting: true,
        header: "ID",
      },
      {
        id: "actions",
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              aria-label={`Edit ${row.original.name}`}
              onClick={() => onEditProduct(row.original)}
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
          cellClassName: "text-right",
          headerClassName: "w-20 text-right",
        },
      },
    ],
    [onEditProduct],
  );

  useEffect(() => {
    const maxPageIndex = Math.max(pageCount - 1, 0);

    if (pagination.pageIndex > maxPageIndex) {
      setPageIndex(maxPageIndex);
    }
  }, [pageCount, pagination.pageIndex, setPageIndex]);

  const table = useReactTable({
    columns,
    data: products,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onPaginationChange: setPagination,
    onSortingChange: setSorting,
    pageCount,
    rowCount: total,
    state: {
      columnFilters,
      globalFilter,
      pagination: constrainPagination(pagination, pageCount),
      sorting: constrainSorting(sorting),
    },
  });

  return (
    <DataTable
      emptyMessage="No products found."
      errorMessage={productsQuery.error?.message}
      globalFilterPlaceholder="Search products..."
      isLoading={isLoading}
      table={table}
      total={total}
      totalLabel={(value) => `${value} ${value === 1 ? "product" : "products"}`}
    />
  );
};

export function useProductListInput(): ProductListInput {
  const { columnFilters, globalFilter, pagination, sorting } = useProductTableStore(
    useShallow((state) => ({
      columnFilters: state.columnFilters,
      globalFilter: state.globalFilter,
      pagination: state.pagination,
      sorting: state.sorting,
    })),
  );
  const sort = sorting[0];

  return useMemo(
    () =>
      ({
        columnFilters: {
          id: getColumnFilterValue(columnFilters, "id"),
          name: getColumnFilterValue(columnFilters, "name"),
        },
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
        search: globalFilter,
        sortBy: sort?.id === "id" ? "id" : "name",
        sortDirection: sort?.desc ? "desc" : "asc",
      }) satisfies ProductListInput,
    [columnFilters, globalFilter, pagination.pageIndex, pagination.pageSize, sort?.desc, sort?.id],
  );
}

function getColumnFilterValue(
  columnFilters: ColumnFiltersState,
  id: "id" | "name",
): string | undefined {
  const value = columnFilters.find((filter) => filter.id === id)?.value;

  return typeof value === "string" && value ? value : undefined;
}

function constrainPagination(pagination: PaginationState, pageCount: number): PaginationState {
  return {
    ...pagination,
    pageIndex: Math.min(pagination.pageIndex, Math.max(pageCount - 1, 0)),
  };
}

function constrainSorting(sorting: SortingState): SortingState {
  const sort = sorting[0];

  return [
    {
      id: sort?.id === "id" ? "id" : "name",
      desc: sort?.desc ?? false,
    },
  ];
}
