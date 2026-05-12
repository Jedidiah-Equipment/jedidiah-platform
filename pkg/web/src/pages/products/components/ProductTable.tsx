import type { Product, ProductListInput, ProductSortBy } from "@pkg/schema";
import { ArrowDownIcon, ArrowUpDownIcon, ArrowUpIcon, PencilIcon } from "lucide-react";
import type React from "react";
import { Button } from "@/components/ui/button.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js";

type ProductTableProps = {
  isLoading: boolean;
  products: Product[];
  search: ProductListInput;
  onEditProduct: (product: Product) => void;
  onToggleSort: (sortBy: ProductSortBy) => void;
};

export const ProductTable: React.FC<ProductTableProps> = ({
  isLoading,
  products,
  search,
  onEditProduct,
  onToggleSort,
}) => {
  return (
    <div className="rounded-lg border">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>
              <SortButton
                isActive={search.sortBy === "name"}
                label="Name"
                sortDirection={search.sortDirection}
                onClick={() => onToggleSort("name")}
              />
            </TableHead>
            <TableHead>
              <SortButton
                isActive={search.sortBy === "id"}
                label="ID"
                sortDirection={search.sortDirection}
                onClick={() => onToggleSort("id")}
              />
            </TableHead>
            <TableHead className="w-20 text-right">Actions</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {isLoading ? <ProductTableSkeleton /> : null}

          {!isLoading && products.length === 0 ? (
            <TableRow>
              <TableCell className="h-24 text-center text-muted-foreground" colSpan={3}>
                No products found.
              </TableCell>
            </TableRow>
          ) : null}

          {products.map((product) => (
            <TableRow key={product.id}>
              <TableCell className="font-medium">{product.name}</TableCell>
              <TableCell className="max-w-[240px] truncate font-mono text-xs text-muted-foreground">
                {product.id}
              </TableCell>
              <TableCell className="text-right">
                <Button
                  aria-label={`Edit ${product.name}`}
                  onClick={() => onEditProduct(product)}
                  size="icon-sm"
                  type="button"
                  variant="ghost"
                >
                  <PencilIcon />
                </Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

type SortButtonProps = {
  isActive: boolean;
  label: string;
  sortDirection: ProductListInput["sortDirection"];
  onClick: () => void;
};

const SortButton: React.FC<SortButtonProps> = ({ isActive, label, sortDirection, onClick }) => {
  const Icon = !isActive ? ArrowUpDownIcon : sortDirection === "asc" ? ArrowUpIcon : ArrowDownIcon;

  return (
    <Button className="-ml-2" onClick={onClick} size="sm" type="button" variant="ghost">
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
