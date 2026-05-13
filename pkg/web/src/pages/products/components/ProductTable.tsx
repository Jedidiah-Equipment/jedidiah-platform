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
  onEditProduct: ((product: Product) => void) | undefined;
  showEditActions: boolean;
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

export const ProductTable: React.FC<ProductTableProps> = ({ onEditProduct, showEditActions }) => {
  const trpc = useTRPC();
  const productListInput = useProductListInput();

  const productsQuery = useQuery(
    trpc.products.list.queryOptions(productListInput, {
      placeholderData: keepPreviousData,
    }),
  );

  const { items: products, total, isLoading } = usePagedQueryResult(productsQuery);

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
  const pageCount = Math.max(1, Math.ceil(total / pagination.pageSize));

  const columns = useMemo<ColumnDef<Product>[]>(() => {
    const tableColumns: ColumnDef<Product>[] = [
      {
        accessorKey: "name",
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: "Name",
      },
      {
        accessorKey: "modelCode",
        cell: ({ row }) => <span className="font-mono text-sm">{row.original.modelCode}</span>,
        enableColumnFilter: true,
        enableSorting: true,
        header: "Model code",
      },
      {
        accessorKey: "basePrice",
        cell: ({ row }) => formatProductPrice(row.original),
        enableColumnFilter: true,
        enableSorting: true,
        header: "Base price",
      },
      {
        accessorKey: "createdAt",
        cell: ({ row }) => formatProductDate(row.original.createdAt),
        enableColumnFilter: true,
        enableSorting: true,
        header: "Created",
      },
      {
        accessorKey: "updatedAt",
        cell: ({ row }) => formatProductDate(row.original.updatedAt),
        enableColumnFilter: false,
        enableSorting: false,
        header: "Updated",
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
    ];

    if (showEditActions && onEditProduct) {
      tableColumns.push({
        id: "actions",
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              aria-label={`Edit ${row.original.name}`}
              onClick={() => onEditProduct?.(row.original)}
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
      });
    }

    return tableColumns;
  }, [onEditProduct, showEditActions]);

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
          basePrice: getColumnFilterValue(columnFilters, "basePrice"),
          createdAt: getColumnFilterValue(columnFilters, "createdAt"),
          id: getColumnFilterValue(columnFilters, "id"),
          modelCode: getColumnFilterValue(columnFilters, "modelCode"),
          name: getColumnFilterValue(columnFilters, "name"),
        },
        page: pagination.pageIndex + 1,
        pageSize: pagination.pageSize,
        search: globalFilter,
        sortBy: getProductSortBy(sort?.id),
        sortDirection: sort?.desc ? "desc" : "asc",
      }) satisfies ProductListInput,
    [columnFilters, globalFilter, pagination.pageIndex, pagination.pageSize, sort?.desc, sort?.id],
  );
}

function getColumnFilterValue(
  columnFilters: ColumnFiltersState,
  id: "basePrice" | "createdAt" | "id" | "modelCode" | "name",
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
      id: getProductSortBy(sort?.id),
      desc: sort?.desc ?? false,
    },
  ];
}

function getProductSortBy(sortId: string | undefined): ProductListInput["sortBy"] {
  if (
    sortId === "basePrice" ||
    sortId === "createdAt" ||
    sortId === "id" ||
    sortId === "modelCode"
  ) {
    return sortId;
  }

  return "name";
}

function formatProductPrice(product: Product): string {
  return new Intl.NumberFormat("en-ZA", {
    currency: product.currencyCode,
    style: "currency",
  }).format(product.basePrice);
}

function formatProductDate(value: Date): string {
  return new Intl.DateTimeFormat("en-ZA", {
    dateStyle: "medium",
  }).format(value);
}
