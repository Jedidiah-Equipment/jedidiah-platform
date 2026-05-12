import type { ProductListInput } from "@pkg/schema";
import type React from "react";
import { Button } from "@/components/ui/button.js";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select.js";

type ProductPaginationProps = {
  pageCount: number;
  search: ProductListInput;
  total: number;
  onChange: (updates: Partial<ProductListInput>) => void;
};

export const ProductPagination: React.FC<ProductPaginationProps> = ({
  pageCount,
  search,
  total,
  onChange,
}) => {
  return (
    <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="text-sm text-muted-foreground">
        {total} {total === 1 ? "product" : "products"}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Rows</span>
          <Select
            onValueChange={(value) =>
              onChange({ page: 1, pageSize: Number.parseInt(String(value), 10) })
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
            onClick={() => onChange({ page: search.page - 1 })}
            size="sm"
            type="button"
            variant="outline"
          >
            Previous
          </Button>
          <Button
            disabled={search.page >= pageCount}
            onClick={() => onChange({ page: search.page + 1 })}
            size="sm"
            type="button"
            variant="outline"
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  );
};
