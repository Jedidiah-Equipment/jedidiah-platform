import type { ProductListResult } from "@pkg/schema";
import { describe, expect, test, vi } from "vitest";

import { createRequestContextFromSession } from "@/auth/request-context.js";
import { mockSession } from "@/test/test-utils.js";

import {
  createListProductsTool,
  ListProductsToolInvalidInputError,
  ListProductsToolUnauthorizedError,
  listProductsTool,
} from "./list-products.js";

function createToolResult(): ProductListResult {
  return {
    items: [],
    sortBy: "name",
    sortDirection: "asc",
    total: 0,
  };
}

describe("listProductsTool.definition", () => {
  test("regresses the generated tool schema", () => {
    expect(listProductsTool.definition).toMatchObject({
      function: {
        description: "List products the authenticated user can read.",
        name: "listProducts",
        parameters: {
          additionalProperties: false,
          properties: {
            columnFilters: {
              additionalProperties: false,
              properties: {
                id: { type: "string" },
                modelCode: { type: "string" },
                name: { type: "string" },
              },
              type: "object",
            },
            page: { default: 1, minimum: 1, type: "integer" },
            pageSize: { default: 10, maximum: 100, minimum: 1, type: "integer" },
            search: { default: "", type: "string" },
            sortBy: {
              default: "name",
              enum: ["basePrice", "createdAt", "id", "modelCode", "name"],
            },
            sortDirection: { default: "asc", enum: ["asc", "desc"] },
          },
          type: "object",
        },
        strict: true,
      },
      type: "function",
    });
  });
});

describe("createListProductsTool().call", () => {
  test("returns the same result shape as product listing behavior", async () => {
    const session = mockSession("product-viewer");
    const listProductsMock = vi.fn().mockResolvedValue(createToolResult());
    const tool = createListProductsTool({
      listProducts: listProductsMock as never,
    });

    const actual = await tool.call(
      createRequestContextFromSession({ db: {} as never, session }),
      {},
    );

    expect(actual).toEqual(createToolResult());
    expect(listProductsMock).toHaveBeenCalledOnce();
    expect(listProductsMock).toHaveBeenCalledWith(
      {} as never,
      expect.objectContaining({
        columnFilters: {},
        page: 1,
        pageSize: 10,
        search: "",
        sortBy: "name",
        sortDirection: "asc",
      }),
    );
  });

  test("rejects unauthorized requests before calling the product list behavior", async () => {
    const listProductsMock = vi.fn();
    const tool = createListProductsTool({
      listProducts: listProductsMock as never,
    });

    await expect(
      tool.call(
        {
          access: null,
          db: {} as never,
        },
        {},
      ),
    ).rejects.toBeInstanceOf(ListProductsToolUnauthorizedError);

    expect(listProductsMock).not.toHaveBeenCalled();
  });

  test("returns a stable invalid-input failure for malformed arguments", async () => {
    const tool = createListProductsTool({
      listProducts: vi.fn() as never,
    });

    await expect(
      tool.call(
        {
          access: {
            permissions: ["product:read"],
            role: "product-viewer",
            userId: "test-user-id",
          },
          db: {} as never,
        },
        {
          page: 0,
        },
      ),
    ).rejects.toBeInstanceOf(ListProductsToolInvalidInputError);
  });

  test("passes authorized requests through to the product list behavior", async () => {
    const listProductsMock = vi.fn().mockResolvedValue(createToolResult());
    const tool = createListProductsTool({
      listProducts: listProductsMock as never,
    });

    const result = await tool.call(
      {
        access: {
          permissions: ["product:read"],
          role: "product-viewer",
          userId: "test-user-id",
        },
        db: {} as never,
      },
      {
        columnFilters: {},
      },
    );

    expect(result).toEqual(createToolResult());
    expect(listProductsMock).toHaveBeenCalledOnce();
    expect(listProductsMock).toHaveBeenCalledWith(
      {} as never,
      expect.objectContaining({
        columnFilters: {},
        page: 1,
        pageSize: 10,
        search: "",
        sortBy: "name",
        sortDirection: "asc",
      }),
    );
  });
});
