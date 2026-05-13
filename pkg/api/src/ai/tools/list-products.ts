import { listProducts } from "@pkg/core";
import { hasPermission } from "@pkg/domain";
import { ProductListInput, type ProductListResult } from "@pkg/schema";
import type { z } from "zod";

import type { RequestContext } from "@/auth/request-context.js";

const ListProductsToolArguments = ProductListInput;

export type ListProductsToolContext = Pick<RequestContext, "access" | "db">;

export type ListProductsToolDependencies = {
  listProducts?: typeof listProducts;
};

export type ListProductsToolDefinition = {
  function: {
    description: string;
    name: string;
    parameters: Record<string, unknown>;
    strict: true;
  };
  type: "function";
};

export class ListProductsToolInvalidInputError extends Error {
  override name = "ListProductsToolInvalidInputError";
  readonly code = "INVALID_INPUT";

  constructor(readonly issues: z.ZodIssue[]) {
    super("Invalid listProducts tool arguments.");
  }
}

export class ListProductsToolUnauthorizedError extends Error {
  override name = "ListProductsToolUnauthorizedError";
  readonly code = "FORBIDDEN";

  constructor() {
    super("You do not have permission to list products.");
  }
}

export type ListProductsTool = {
  call: (context: ListProductsToolContext, rawInput: unknown) => Promise<ProductListResult>;
  definition: ListProductsToolDefinition;
};

export function createListProductsTool(
  dependencies: ListProductsToolDependencies = {},
): ListProductsTool {
  const listProductsImpl = dependencies.listProducts ?? listProducts;
  const definition = {
    function: {
      description: "List products the authenticated user can read.",
      name: "listProducts",
      parameters: ListProductsToolArguments.toJSONSchema({
        target: "draft-7",
      }) as Record<string, unknown>,
      strict: true as const,
    },
    type: "function" as const,
  };

  return {
    call: async (context, rawInput) => {
      const parsedInput = ListProductsToolArguments.safeParse(rawInput);

      if (!parsedInput.success) {
        throw new ListProductsToolInvalidInputError(parsedInput.error.issues);
      }

      if (!hasPermission(context.access, "product:read")) {
        throw new ListProductsToolUnauthorizedError();
      }

      return listProductsImpl(context.db, parsedInput.data);
    },
    definition,
  };
}

export const listProductsTool = createListProductsTool();
