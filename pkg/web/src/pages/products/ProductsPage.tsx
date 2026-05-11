import type { Product, ProductCreateInput, ProductListInput, ProductSortBy } from "@pkg/schema";
import { ProductCreateInputSchema, ProductListInputSchema } from "@pkg/schema";
import { useNavigate } from "@tanstack/react-router";
import {
  ArrowDownIcon,
  ArrowUpDownIcon,
  ArrowUpIcon,
  Loader2Icon,
  PencilIcon,
  PlusIcon,
} from "lucide-react";
import type React from "react";
import { useState } from "react";
import { toast } from "sonner";
import { useAppForm } from "@/components/form/index.js";
import { Button } from "@/components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { FieldGroup } from "@/components/ui/field.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";
import { Separator } from "@/components/ui/separator.js";
import { Skeleton } from "@/components/ui/skeleton.js";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table.js";
import { trpc } from "@/lib/trpc.js";

type ProductsPageProps = {
  search: ProductListInput;
};

export const ProductsPage: React.FC<ProductsPageProps> = ({ search }) => {
  const navigate = useNavigate();
  const trpcUtils = trpc.useUtils();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const productsQuery = trpc.products.list.useQuery(search);
  const createProductMutation = trpc.products.create.useMutation({
    onSuccess: async () => {
      await trpcUtils.products.list.invalidate();
      setIsCreateOpen(false);
      toast.success("Product created");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const updateProductMutation = trpc.products.update.useMutation({
    onSuccess: async () => {
      await trpcUtils.products.list.invalidate();
      setEditingProduct(null);
      toast.success("Product updated");
    },
    onError: (error) => {
      toast.error(error.message);
    },
  });
  const products = productsQuery.data?.items ?? [];
  const total = productsQuery.data?.total ?? 0;
  const pageCount = productsQuery.data?.pageCount ?? 1;

  const updateSearch = (updates: Partial<ProductListInput>) => {
    void navigate({
      to: "/products",
      search: ProductListInputSchema.parse({
        ...search,
        ...updates,
      }),
    });
  };

  const toggleSort = (sortBy: ProductSortBy) => {
    updateSearch({
      page: 1,
      sortBy,
      sortDirection: search.sortBy === sortBy && search.sortDirection === "asc" ? "desc" : "asc",
    });
  };

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 pt-0">
      <Card>
        <CardHeader>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
            <div className="flex flex-col gap-1">
              <CardDescription>Catalog</CardDescription>
              <CardTitle>Products</CardTitle>
            </div>
            <Button onClick={() => setIsCreateOpen(true)}>
              <PlusIcon data-icon="inline-start" />
              New product
            </Button>
          </div>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <Separator />
          <div className="rounded-lg border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>
                    <SortButton
                      isActive={search.sortBy === "name"}
                      label="Name"
                      sortDirection={search.sortDirection}
                      onClick={() => toggleSort("name")}
                    />
                  </TableHead>
                  <TableHead>
                    <SortButton
                      isActive={search.sortBy === "id"}
                      label="ID"
                      sortDirection={search.sortDirection}
                      onClick={() => toggleSort("id")}
                    />
                  </TableHead>
                  <TableHead className="w-20 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {productsQuery.isLoading ? <ProductTableSkeleton /> : null}

                {!productsQuery.isLoading && products.length === 0 ? (
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
                        onClick={() => setEditingProduct(product)}
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

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="text-sm text-muted-foreground">
              {total} {total === 1 ? "product" : "products"}
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">Rows</span>
                <Select
                  onValueChange={(value) =>
                    updateSearch({ page: 1, pageSize: Number.parseInt(String(value), 10) })
                  }
                  value={String(search.pageSize)}
                >
                  <SelectTrigger size="sm">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectGroup>
                      {[10, 25, 50].map((pageSize) => (
                        <SelectItem key={pageSize} value={String(pageSize)}>
                          {pageSize}
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  </SelectContent>
                </Select>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm text-muted-foreground">
                  Page {search.page} of {pageCount}
                </span>
                <Button
                  disabled={search.page <= 1}
                  onClick={() => updateSearch({ page: search.page - 1 })}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Previous
                </Button>
                <Button
                  disabled={search.page >= pageCount}
                  onClick={() => updateSearch({ page: search.page + 1 })}
                  size="sm"
                  type="button"
                  variant="outline"
                >
                  Next
                </Button>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Dialog onOpenChange={setIsCreateOpen} open={isCreateOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>New product</DialogTitle>
            <DialogDescription>Add a product to the catalog.</DialogDescription>
          </DialogHeader>
          {isCreateOpen ? (
            <ProductForm
              isPending={createProductMutation.isPending}
              onSubmit={(value) => createProductMutation.mutateAsync(value)}
              submitLabel="Create product"
            />
          ) : null}
        </DialogContent>
      </Dialog>

      <Dialog onOpenChange={(isOpen) => !isOpen && setEditingProduct(null)} open={!!editingProduct}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit product</DialogTitle>
            <DialogDescription>Update the product name.</DialogDescription>
          </DialogHeader>
          {editingProduct ? (
            <ProductForm
              initialName={editingProduct.name}
              isPending={updateProductMutation.isPending}
              key={editingProduct.id}
              onSubmit={(value) =>
                updateProductMutation.mutateAsync({
                  id: editingProduct.id,
                  name: value.name,
                })
              }
              submitLabel="Save product"
            />
          ) : null}
        </DialogContent>
      </Dialog>
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

type ProductFormProps = {
  initialName?: string;
  isPending: boolean;
  submitLabel: string;
  onSubmit: (value: ProductCreateInput) => Promise<unknown>;
};

const ProductForm: React.FC<ProductFormProps> = ({
  initialName = "",
  isPending,
  submitLabel,
  onSubmit,
}) => {
  const form = useAppForm({
    defaultValues: {
      name: initialName,
    } satisfies ProductCreateInput,
    validators: {
      onSubmit: ProductCreateInputSchema,
    },
    onSubmit: async ({ value }) => {
      await onSubmit(value);
    },
  });

  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void form.handleSubmit();
      }}
    >
      <FieldGroup>
        <form.AppField name="name">
          {(field) => <field.TextField autoComplete="off" label="Name" />}
        </form.AppField>
      </FieldGroup>
      <DialogFooter className="mt-4" showCloseButton>
        <form.Subscribe selector={(state) => state.isSubmitting}>
          {(isSubmitting) => (
            <Button disabled={isSubmitting || isPending} type="submit">
              {isSubmitting || isPending ? (
                <Loader2Icon data-icon="inline-start" className="animate-spin" />
              ) : null}
              {submitLabel}
            </Button>
          )}
        </form.Subscribe>
      </DialogFooter>
    </form>
  );
};
