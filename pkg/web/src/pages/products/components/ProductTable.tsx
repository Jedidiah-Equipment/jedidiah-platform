import type { Product, ProductListInput } from "@pkg/schema";
import {
  type Column,
  type ColumnDef,
  flexRender,
  functionalUpdate,
  getCoreRowModel,
  type PaginationState,
  type SortingState,
  useReactTable,
} from "@tanstack/react-table";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, PencilIcon } from "lucide-react";
import type React from "react";
import { useMemo } from "react";
import { Button } from "@/components/ui/button.js";
import { Input } from "@/components/ui/input.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js";
import { ProductPagination } from "./ProductPagination.js";

type ProductTableProps = {
  isLoading: boolean;
  pageCount: number;
  products: Product[];
  search: ProductListInput;
  searchText: string;
  total: number;
  onEditProduct: (product: Product) => void;
  onSearchTextChange: (value: string) => void;
  onTableChange: (updates: Partial<ProductListInput>) => void;
};

export const ProductTable: React.FC<ProductTableProps> = ({
  isLoading,
  pageCount,
  products,
  search,
  searchText,
  total,
  onEditProduct,
  onSearchTextChange,
  onTableChange,
}) => {
  const pagination = useMemo<PaginationState>(
    () => ({
      pageIndex: search.page - 1,
      pageSize: search.pageSize,
    }),
    [search.page, search.pageSize],
  );
  const sorting = useMemo<SortingState>(
    () => [
      {
        id: search.sortBy,
        desc: search.sortDirection === "desc",
      },
    ],
    [search.sortBy, search.sortDirection],
  );
  const columns = useMemo<ColumnDef<Product>[]>(
    () => [
      {
        accessorKey: "name",
        header: ({ column }) => <SortButton column={column} label="Name" />,
        cell: ({ row }) => <span className="font-medium">{row.original.name}</span>,
      },
      {
        accessorKey: "id",
        header: ({ column }) => <SortButton column={column} label="ID" />,
        cell: ({ row }) => (
          <span className="block max-w-[240px] truncate font-mono text-xs text-muted-foreground">
            {row.original.id}
          </span>
        ),
      },
      {
        id: "actions",
        enableSorting: false,
        header: () => <span className="sr-only">Actions</span>,
        cell: ({ row }) => (
          <div className="text-right">
            <Button
              aria-label={`Edit ${row.original.name}`}
              onClick={() => onEditProduct(row.original)}
              size="icon-sm"
              type="button"
              variant="ghost"
            >
              <PencilIcon />
            </Button>
          </div>
        ),
      },
    ],
    [onEditProduct],
  );
  const table = useReactTable({
    columns,
    data: products,
    enableSortingRemoval: false,
    getCoreRowModel: getCoreRowModel(),
    manualFiltering: true,
    manualPagination: true,
    manualSorting: true,
    onGlobalFilterChange: (updater) => {
      const nextSearch = functionalUpdate(updater, search.search);

      onTableChange({
        page: 1,
        search: String(nextSearch),
      });
    },
    onPaginationChange: (updater) => {
      const nextPagination = functionalUpdate(updater, pagination);

      onTableChange({
        page: nextPagination.pageIndex + 1,
        pageSize: nextPagination.pageSize,
      });
    },
    onSortingChange: (updater) => {
      const nextSorting = functionalUpdate(updater, sorting);
      const sort = nextSorting[0];
      const sortBy = sort?.id === "id" ? "id" : "name";

      onTableChange({
        page: 1,
        sortBy,
        sortDirection: sort?.desc ? "desc" : "asc",
      });
    },
    pageCount,
    rowCount: total,
    state: {
      globalFilter: search.search,
      pagination,
      sorting,
    },
  });

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <Input
          className="sm:max-w-xs"
          onChange={(event) => onSearchTextChange(event.target.value)}
          placeholder="Search products..."
          value={searchText}
        />
      </div>

      <div className="rounded-lg border">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <TableHead
                    className={header.column.id === "actions" ? "w-20 text-right" : undefined}
                    key={header.id}
                  >
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </TableHead>
                ))}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? <ProductTableSkeleton /> : null}

            {!isLoading && table.getRowModel().rows.length === 0 ? (
              <TableRow>
                <TableCell className="h-24 text-center text-muted-foreground" colSpan={3}>
                  No products found.
                </TableCell>
              </TableRow>
            ) : null}

            {!isLoading
              ? table.getRowModel().rows.map((row) => (
                  <TableRow key={row.id}>
                    {row.getVisibleCells().map((cell) => (
                      <TableCell
                        className={cell.column.id === "actions" ? "text-right" : undefined}
                        key={cell.id}
                      >
                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                      </TableCell>
                    ))}
                  </TableRow>
                ))
              : null}
          </TableBody>
        </Table>
      </div>

      <ProductPagination table={table} total={total} />
    </div>
  );
};

type SortButtonProps = {
  column: Column<Product>;
  label: string;
};

const SortButton: React.FC<SortButtonProps> = ({ column, label }) => {
  const sorted = column.getIsSorted();
  const Icon = sorted === false ? ArrowUpDownIcon : sorted === "asc" ? ArrowUpIcon : ArrowDownIcon;

  return (
    <Button
      className="-ml-2"
      onClick={() => column.toggleSorting(sorted === "asc")}
      size="sm"
      type="button"
      variant="ghost"
    >
      {label}
      <Icon data-icon="inline-end" />
    </Button>
  );
};

const skeletonRows = [
  "product-skeleton-1",
  "product-skeleton-2",
  "product-skeleton-3",
  "product-skeleton-4",
];

const ProductTableSkeleton: React.FC = () => {
  return skeletonRows.map((rowKey) => (
    <TableRow key={rowKey}>
      <TableCell>
        <Skeleton className="h-4 w-40" />
      </TableCell>
      <TableCell>
        <Skeleton className="h-4 w-64" />
      </TableCell>
      <TableCell>
        <div className="flex justify-end">
          <Skeleton className="size-7" />
        </div>
      </TableCell>
    </TableRow>
  ));
};
