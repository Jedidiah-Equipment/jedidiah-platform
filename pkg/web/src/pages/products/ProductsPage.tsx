import { type Product, ProductListInput } from "@pkg/schema";
import { useNavigate } from "@tanstack/react-router";
import { PlusIcon } from "lucide-react";
import type React from "react";
import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button.js";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card.js";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog.js";
import { Separator } from "@/components/ui/separator.js";
import { trpc } from "@/lib/trpc.js";
import { ProductForm } from "./components/ProductForm.js";
import { ProductTable } from "./components/ProductTable.js";

type ProductsPageProps = {
  search: ProductListInput;
};

export const ProductsPage: React.FC<ProductsPageProps> = ({ search }) => {
  const navigate = useNavigate();
  const trpcUtils = trpc.useUtils();
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [searchText, setSearchText] = useState(search.search);
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

  const updateSearch = useCallback(
    (updates: Partial<ProductListInput>) => {
      const nextSearch = ProductListInput.parse({
        ...search,
        ...updates,
      });

      if (JSON.stringify(nextSearch) === JSON.stringify(search)) {
        return;
      }

      void navigate({
        to: "/products",
        search: nextSearch,
      });
    },
    [navigate, search],
  );

  useEffect(() => {
    setSearchText(search.search);
  }, [search.search]);

  useEffect(() => {
    if (searchText === search.search) {
      return;
    }

    const timeoutId = window.setTimeout(() => {
      updateSearch({
        page: 1,
        search: searchText,
      });
    }, 250);

    return () => window.clearTimeout(timeoutId);
  }, [search.search, searchText, updateSearch]);

  const updateTableSearch = (updates: Partial<ProductListInput>) => {
    void navigate({
      to: "/products",
      search: ProductListInput.parse({
        ...search,
        ...updates,
      }),
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
          <ProductTable
            isLoading={productsQuery.isLoading}
            pageCount={pageCount}
            products={products}
            search={search}
            searchText={searchText}
            total={total}
            onEditProduct={setEditingProduct}
            onSearchTextChange={setSearchText}
            onTableChange={updateTableSearch}
          />
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
