import * as productsCore from "@pkg/core";
import type { Database } from "@pkg/db";
import { user } from "@pkg/db/schema";
import { createUserAccessSummary } from "@pkg/domain";
import type { Product, ProductListInput, UserAccessSummary } from "@pkg/schema";
import { describe, expect, vi } from "vitest";
import { z } from "zod";

import type { AiContext } from "@/routes/ai/ai-context.js";
import { ToolAuthorizationError } from "@/routes/ai/ai-errors.js";
import { listProductsTool } from "@/routes/ai/tools/list-products.js";
import { type AppRouterCaller, createTester } from "@/test/create-tester.js";
import { mockSession } from "@/test/test-utils.js";

const test = createTester(async ({ db }) => {
  await createActorUser(db);

  return { db };
});

async function createProduct(
  caller: AppRouterCaller,
  name: string,
  overrides: Partial<Parameters<AppRouterCaller["products"]["create"]>[0]> = {},
): Promise<Product> {
  return caller.products.create({
    basePrice: 1_000,
    description: null,
    modelCode: createModelCode(name),
    name,
    ...overrides,
  });
}

function createModelCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

function createAiContext(db: Database, access: UserAccessSummary): AiContext {
  return {
    access,
    db,
    session: mockSession(access.role ?? "product-viewer"),
  };
}

function createAccessWithNoProductRead(): UserAccessSummary {
  return {
    permissions: [],
    role: null,
    userId: "test-user-id",
  };
}

async function createActorUser(db: Database) {
  const now = new Date();

  await db.insert(user).values({
    createdAt: now,
    email: "test@example.com",
    emailVerified: true,
    id: "test-user-id",
    name: "Test User",
    role: "admin",
    updatedAt: now,
  });
}

describe("listProductsTool", () => {
  test("returns the same product list result shape as products.list", async ({ context }) => {
    const adminCaller = context.createCaller();
    const viewerCaller = context.createCaller(mockSession("product-viewer"));
    await createProduct(adminCaller, "Compact Loader", {
      modelCode: "CL-100",
    });
    await createProduct(adminCaller, "Excavator Bucket", {
      modelCode: "EX-200",
    });

    const input: ProductListInput = {
      page: 1,
      pageSize: 10,
      columnFilters: {
        modelCode: "CL",
      },
      search: "loader",
      sortBy: "name",
      sortDirection: "asc",
    } as const;
    const access = createUserAccessSummary({
      role: "product-viewer",
      userId: "test-user-id",
    });

    const [toolResult, trpcResult] = await Promise.all([
      listProductsTool.handler(input, createAiContext(context.db, access)),
      viewerCaller.products.list(input),
    ]);

    expect(toolResult).toEqual(trpcResult);
  });

  test("throws ToolAuthorizationError without product read permission", async ({ context }) => {
    const listProductsSpy = vi.spyOn(productsCore, "listProducts");

    try {
      await expect(
        listProductsTool.handler({}, createAiContext(context.db, createAccessWithNoProductRead())),
      ).rejects.toBeInstanceOf(ToolAuthorizationError);
      expect(listProductsSpy).not.toHaveBeenCalled();
    } finally {
      listProductsSpy.mockRestore();
    }
  });

  test("treats null tool args as the default product list input", async ({ context }) => {
    const access = createUserAccessSummary({
      role: "product-viewer",
      userId: "test-user-id",
    });
    const listProductsSpy = vi.spyOn(productsCore, "listProducts").mockResolvedValue({
      items: [],
      sortBy: "name",
      sortDirection: "asc",
      total: 0,
    });

    try {
      await listProductsTool.handler(null, createAiContext(context.db, access));

      expect(listProductsSpy).toHaveBeenCalledWith(
        context.db,
        expect.objectContaining({
          page: 1,
          pageSize: 10,
          search: "",
          sortBy: "name",
          sortDirection: "asc",
        }),
      );
    } finally {
      listProductsSpy.mockRestore();
    }
  });

  test("rejects invalid product list args", async ({ context }) => {
    const access = createUserAccessSummary({
      role: "product-viewer",
      userId: "test-user-id",
    });

    await expect(
      listProductsTool.handler(
        {
          sortBy: "bad-sort",
        },
        createAiContext(context.db, access),
      ),
    ).rejects.toBeInstanceOf(z.ZodError);
  });
});
