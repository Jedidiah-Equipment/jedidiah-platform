import type { Product } from "@pkg/schema";
import { describe, expect } from "vitest";

import { type AppRouterCaller, createTester } from "@/test/create-tester.js";
import { mockSession } from "@/test/test-utils.js";

const test = createTester();

async function createProduct(caller: AppRouterCaller, name: string): Promise<Product> {
  return caller.products.create({ name });
}

async function createProducts(caller: AppRouterCaller, names: string[]): Promise<Product[]> {
  const created: Product[] = [];

  for (const name of names) {
    created.push(await createProduct(caller, name));
  }

  return created;
}

function productNames(products: Product[]): string[] {
  return products.map((product) => product.name);
}

describe("products.create", () => {
  test("creates products", async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, "Wheel Loader");

    expect(created.name).toBe("Wheel Loader");
  });

  test("trims product names", async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, "  Compact Loader  ");

    expect(created.name).toBe("Compact Loader");
  });

  test("returns conflict for duplicate product names", async ({ context }) => {
    const caller = context.createCaller();

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

  test("isolates product data between per-test databases", async ({ context }) => {
    const caller = context.createCaller();
    const createResult = await createProduct(caller, "Reusable Isolated Name");

    expect(createResult.name).toBe("Reusable Isolated Name");
  });

  test("allows the same product name in another isolated test database", async ({ context }) => {
    const caller = context.createCaller();
    const createResult = await createProduct(caller, "Reusable Isolated Name");

    expect(createResult.name).toBe("Reusable Isolated Name");
  });

  test("allows product editors to create products", async ({ context }) => {
    const caller = context.createCaller(mockSession("product-editor"));
    const created = await createProduct(caller, "Editor Created Product");

    expect(created.name).toBe("Editor Created Product");
  });

  test("rejects product viewers", async ({ context }) => {
    const caller = context.createCaller(mockSession("product-viewer"));

    await expect(caller.products.create({ name: "Read Only Product" })).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("products.list", () => {
  test("rejects unauthenticated product lists", async ({ context }) => {
    const caller = context.createAnonCaller();

    await expect(caller.products.list({})).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("allows product viewers to list products", async ({ context }) => {
    const adminCaller = context.createCaller();
    const viewerCaller = context.createCaller(mockSession("product-viewer"));

    await createProduct(adminCaller, "Viewer Product");

    const result = await viewerCaller.products.list({});

    expect(productNames(result.items)).toEqual(["Viewer Product"]);
  });

  test("lists products with default name sorting", async ({ context }) => {
    const caller = context.createCaller();
    await createProducts(caller, ["Z Loader", "A Bucket"]);

    const result = await caller.products.list({});

    expect(productNames(result.items)).toEqual(["A Bucket", "Z Loader"]);
    expect(result.total).toBe(2);
    expect(result.sortBy).toBe("name");
    expect(result.sortDirection).toBe("asc");
  });

  test("pages and sorts products", async ({ context }) => {
    const caller = context.createCaller();
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
    expect(result.sortBy).toBe("name");
    expect(result.sortDirection).toBe("asc");
  });

  test("searches product names case-insensitively", async ({ context }) => {
    const caller = context.createCaller();
    await createProducts(caller, ["Compact Loader", "Excavator Bucket", "Wheel LOADER"]);

    const result = await caller.products.list({
      page: 1,
      pageSize: 10,
      columnFilters: {},
      search: "loader",
      sortBy: "name",
      sortDirection: "asc",
    });

    expect(productNames(result.items)).toEqual(["Compact Loader", "Wheel LOADER"]);
    expect(result.total).toBe(2);
  });

  test("applies search before paging and counting", async ({ context }) => {
    const caller = context.createCaller();
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
  });

  test("searches product names and IDs globally", async ({ context }) => {
    const caller = context.createCaller();
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
    const caller = context.createCaller();
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
    const caller = context.createCaller();
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
    const caller = context.createCaller();
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
  });
});

describe("products.update", () => {
  test("updates products", async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, "Wheel Loader");

    const updated = await caller.products.update({
      id: created.id,
      name: "Wheel Loader XL",
    });

    expect(updated).toEqual({
      id: created.id,
      name: "Wheel Loader XL",
    });
  });

  test("trims product names", async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, "Compact Loader");

    const updated = await caller.products.update({
      id: created.id,
      name: "  Compact Loader Plus  ",
    });

    expect(updated.name).toBe("Compact Loader Plus");
  });

  test("returns not found for missing product updates", async ({ context }) => {
    const caller = context.createCaller();

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

  test("allows product editors to update products", async ({ context }) => {
    const adminCaller = context.createCaller();
    const editorCaller = context.createCaller(mockSession("product-editor"));
    const created = await createProduct(adminCaller, "Editor Product");

    const updated = await editorCaller.products.update({
      id: created.id,
      name: "Editor Product Plus",
    });

    expect(updated.name).toBe("Editor Product Plus");
  });

  test("rejects product viewers", async ({ context }) => {
    const adminCaller = context.createCaller();
    const viewerCaller = context.createCaller(mockSession("product-viewer"));
    const created = await createProduct(adminCaller, "Viewer Update Product");

    await expect(
      viewerCaller.products.update({
        id: created.id,
        name: "Viewer Update Product Plus",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});
