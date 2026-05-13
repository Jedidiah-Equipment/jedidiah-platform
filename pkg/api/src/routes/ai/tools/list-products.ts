import * as productsCore from "@pkg/core";
import { hasPermission } from "@pkg/domain";
import { ProductListInput, type ProductListResult } from "@pkg/schema";

import type { AiContext } from "../ai-context.js";
import { ToolAuthorizationError } from "../ai-errors.js";

export type ListProductsTool = {
  description: string;
  handler: (args: unknown, ctx: AiContext) => Promise<ProductListResult>;
  inputSchema: typeof ProductListInput;
  name: "listProducts";
};

export const listProductsTool: ListProductsTool = {
  name: "listProducts",
  description:
    "List products with the same filters, sort, and paging available in the products page.",
  inputSchema: ProductListInput,
  async handler(args: unknown, ctx: AiContext) {
    const input = ProductListInput.parse(args);

    if (!hasPermission(ctx.access, "product:read")) {
      throw new ToolAuthorizationError("Missing product:read permission");
    }

    return productsCore.listProducts(ctx.db, input);
  },
};
