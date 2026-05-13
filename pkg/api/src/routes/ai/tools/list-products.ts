import * as productsCore from "@pkg/core";
import { hasPermission } from "@pkg/domain";
import { ProductListInput, ProductListResult } from "@pkg/schema";

import type { AiContext } from "../ai-context.js";
import { ToolAuthorizationError } from "../ai-errors.js";

export type ListProductsTool = {
  description: string;
  handler: (args: unknown, ctx: AiContext) => Promise<ProductListResult>;
  inputSchema: typeof ProductListInput;
  name: "listProducts";
  summarizeResult: (result: unknown) => string;
};

export const listProductsTool: ListProductsTool = {
  name: "listProducts",
  description:
    "List products with the same filters, sort, and paging available in the products page.",
  inputSchema: ProductListInput,
  async handler(args: unknown, ctx: AiContext) {
    const input = ProductListInput.parse(args ?? {});

    if (!hasPermission(ctx.access, "product:read")) {
      throw new ToolAuthorizationError("Missing product:read permission");
    }

    return productsCore.listProducts(ctx.db, input);
  },
  summarizeResult(result: unknown) {
    const productList = ProductListResult.parse(result);

    if (productList.total === 0) {
      return "No products found.";
    }

    const shownProducts = productList.items.slice(0, 5);

    if (shownProducts.length === 0) {
      return `${productList.total} ${pluralize("product", productList.total)} found, but this page returned no items.`;
    }

    const productSummaries = shownProducts
      .map(
        (product) =>
          `${product.name} (${product.modelCode}) - ${formatCurrency(product.basePrice, product.currencyCode)}`,
      )
      .join("; ");
    const remainingCount = Math.max(productList.total - shownProducts.length, 0);
    const suffix = remainingCount > 0 ? `; ${remainingCount} more not shown on this page` : "";

    return `${productList.total} ${pluralize("product", productList.total)}: ${productSummaries}${suffix}`;
  },
};

function formatCurrency(amount: number, currencyCode: string): string {
  return `${currencyCode} ${amount.toLocaleString("en-ZA", {
    maximumFractionDigits: 2,
    minimumFractionDigits: 2,
  })}`;
}

function pluralize(label: string, count: number): string {
  return count === 1 ? label : `${label}s`;
}
