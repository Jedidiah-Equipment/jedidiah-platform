import type { Product } from "@pkg/schema";
import { expect } from "vitest";

import { Tester } from "@/test/Tester.js";
import type { Context } from "@/trpc/context.js";
import type { AppRouter } from "@/trpc/router.js";

type ProductCaller = ReturnType<AppRouter["createCaller"]>;

type ProductRouterTestContext = {
  createCaller: (session?: Context["session"]) => ProductCaller;
};

const { test } = new Tester<ProductRouterTestContext>(async ({ db }) => {
  const { createAppRouterCaller } = await import("@/trpc/router.js");

  return {
    createCaller: (session = mockSession()) =>
      createAppRouterCaller({
        db,
        req: {} as Context["req"],
        session,
      }),
  };
});

function mockSession(): NonNullable<Context["session"]> {
  return {
    session: {
      id: "test-session-id",
      userId: "test-user-id",
      token: "test-token",
      expiresAt: new Date(Date.now() + 60_000),
      ipAddress: null,
      userAgent: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
    user: {
      id: "test-user-id",
      name: "Test User",
      email: "test@example.com",
      emailVerified: true,
      image: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    },
  } as NonNullable<Context["session"]>;
}

function createAuthenticatedCaller(context: ProductRouterTestContext): ProductCaller {
  return context.createCaller();
}

async function createProduct(caller: ProductCaller, name: string): Promise<Product> {
  return caller.products.create({ name });
}

async function createProducts(caller: ProductCaller, names: string[]): Promise<Product[]> {
  const created: Product[] = [];

  for (const name of names) {
    created.push(await createProduct(caller, name));
  }

  return created;
}

function productNames(products: Product[]): string[] {
  return products.map((product) => product.name);
}

test("rejects unauthenticated product lists", async ({ context }) => {
  const caller = context.createCaller(null);

  await expect(caller.products.list({})).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
});

test("creates, lists, and updates products for authenticated users", async ({ context }) => {
  const caller = createAuthenticatedCaller(context);
  const created = await createProduct(caller, "Wheel Loader");

  expect(created.name).toBe("Wheel Loader");

  const listResult = await caller.products.list({
    page: 1,
    pageSize: 10,
    columnFilters: {},
    search: "",
    sortBy: "name",
    sortDirection: "asc",
  });

  expect(listResult.items).toEqual([created]);
  expect(listResult.total).toBe(1);
  expect(listResult.page).toBe(1);
  expect(listResult.pageSize).toBe(10);
  expect(listResult.pageCount).toBe(1);
  expect(listResult.sortBy).toBe("name");
  expect(listResult.sortDirection).toBe("asc");

  const updated = await caller.products.update({
    id: created.id,
    name: "Wheel Loader XL",
  });

  expect(updated).toEqual({
    id: created.id,
    name: "Wheel Loader XL",
  });
});

test("trims product names on create and update", async ({ context }) => {
  const caller = createAuthenticatedCaller(context);
  const created = await createProduct(caller, "  Compact Loader  ");

  expect(created.name).toBe("Compact Loader");

  const updated = await caller.products.update({
    id: created.id,
    name: "  Compact Loader Plus  ",
  });

  expect(updated.name).toBe("Compact Loader Plus");
});

test("lists products with default name sorting", async ({ context }) => {
  const caller = createAuthenticatedCaller(context);
  await createProducts(caller, ["Z Loader", "A Bucket"]);

  const result = await caller.products.list({});

  expect(productNames(result.items)).toEqual(["A Bucket", "Z Loader"]);
  expect(result.total).toBe(2);
  expect(result.page).toBe(1);
  expect(result.pageSize).toBe(10);
  expect(result.pageCount).toBe(1);
  expect(result.sortBy).toBe("name");
  expect(result.sortDirection).toBe("asc");
});

test("pages and sorts products", async ({ context }) => {
  const caller = createAuthenticatedCaller(context);
  await createProducts(caller, ["Alpha", "Bravo", "Charlie"]);

  const result = await caller.products.list({
    page: 2,
    pageSize: 2,
    columnFilters: {},
    search: "",
    sortBy: "name",
    sortDirection: "asc",
  });

  expect(productNames(result.items)).toEqual(["Charlie"]);
  expect(result.total).toBe(3);
  expect(result.page).toBe(2);
  expect(result.pageSize).toBe(2);
  expect(result.pageCount).toBe(2);
  expect(result.sortBy).toBe("name");
  expect(result.sortDirection).toBe("asc");
});

test("searches product names case-insensitively", async ({ context }) => {
  const caller = createAuthenticatedCaller(context);
  await createProducts(caller, ["Compact Loader", "Excavator Bucket", "Wheel LOADER"]);

  const listResult = await caller.products.list({
    page: 1,
    pageSize: 10,
    columnFilters: {},
    search: "loader",
    sortBy: "name",
    sortDirection: "asc",
  });

  expect(productNames(listResult.items)).toEqual(["Compact Loader", "Wheel LOADER"]);
  expect(listResult.total).toBe(2);
  expect(listResult.pageCount).toBe(1);
});

test("applies search before paging and counting", async ({ context }) => {
  const caller = createAuthenticatedCaller(context);
  await createProducts(caller, ["Alpha Loader", "Bravo Loader", "Charlie Loader", "Excavator"]);

  const result = await caller.products.list({
    page: 2,
    pageSize: 2,
    columnFilters: {},
    search: "loader",
    sortBy: "name",
    sortDirection: "asc",
  });

  expect(productNames(result.items)).toEqual(["Charlie Loader"]);
  expect(result.total).toBe(3);
  expect(result.pageCount).toBe(2);
});

test("searches product names and IDs globally", async ({ context }) => {
  const caller = createAuthenticatedCaller(context);
  const loader = await createProduct(caller, "Compact Loader");
  await createProduct(caller, "Excavator Bucket");

  const nameResult = await caller.products.list({
    page: 1,
    pageSize: 10,
    columnFilters: {},
    search: "loader",
    sortBy: "name",
    sortDirection: "asc",
  });
  const idResult = await caller.products.list({
    page: 1,
    pageSize: 10,
    columnFilters: {},
    search: loader.id.slice(0, 8),
    sortBy: "name",
    sortDirection: "asc",
  });

  expect(nameResult.items.map((product) => product.id)).toEqual([loader.id]);
  expect(idResult.items.map((product) => product.id)).toEqual([loader.id]);
});

test("filters product lists by name column filter", async ({ context }) => {
  const caller = createAuthenticatedCaller(context);
  await createProducts(caller, ["Compact Loader", "Wheel Loader", "Excavator Bucket"]);

  const result = await caller.products.list({
    page: 1,
    pageSize: 10,
    columnFilters: {
      name: "loader",
    },
    search: "",
    sortBy: "name",
    sortDirection: "asc",
  });

  expect(productNames(result.items)).toEqual(["Compact Loader", "Wheel Loader"]);
  expect(result.total).toBe(2);
});

test("filters product lists by id column filter", async ({ context }) => {
  const caller = createAuthenticatedCaller(context);
  const loader = await createProduct(caller, "Compact Loader");
  await createProduct(caller, "Excavator Bucket");

  const result = await caller.products.list({
    page: 1,
    pageSize: 10,
    columnFilters: {
      id: loader.id.slice(0, 8),
    },
    search: "",
    sortBy: "name",
    sortDirection: "asc",
  });

  expect(result.items.map((product) => product.id)).toEqual([loader.id]);
  expect(result.total).toBe(1);
});

test("combines global search and column filters before paging and counting", async ({
  context,
}) => {
  const caller = createAuthenticatedCaller(context);
  await createProducts(caller, [
    "Alpha Loader",
    "Bravo Loader",
    "Bravo Excavator",
    "Charlie Loader",
  ]);

  const result = await caller.products.list({
    page: 1,
    pageSize: 10,
    columnFilters: {
      name: "bravo",
    },
    search: "loader",
    sortBy: "name",
    sortDirection: "asc",
  });

  expect(productNames(result.items)).toEqual(["Bravo Loader"]);
  expect(result.total).toBe(1);
  expect(result.pageCount).toBe(1);
});

test("returns conflict for duplicate product names", async ({ context }) => {
  const caller = createAuthenticatedCaller(context);

  await createProduct(caller, "Duplicate Product");

  await expect(
    caller.products.create({
      name: "Duplicate Product",
    }),
  ).rejects.toMatchObject({
    code: "CONFLICT",
    message: "A product with this name already exists.",
  });
});

test("returns not found for missing product updates", async ({ context }) => {
  const caller = createAuthenticatedCaller(context);

  await expect(
    caller.products.update({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Missing",
    }),
  ).rejects.toMatchObject({
    code: "NOT_FOUND",
    message: "Product not found.",
  });
});

test("isolates product data between per-test databases", async ({ context }) => {
  const caller = createAuthenticatedCaller(context);
  const createResult = await createProduct(caller, "Reusable Isolated Name");

  expect(createResult.name).toBe("Reusable Isolated Name");
});

test("allows the same product name in another isolated test database", async ({ context }) => {
  const caller = createAuthenticatedCaller(context);
  const createResult = await createProduct(caller, "Reusable Isolated Name");

  expect(createResult.name).toBe("Reusable Isolated Name");
});
