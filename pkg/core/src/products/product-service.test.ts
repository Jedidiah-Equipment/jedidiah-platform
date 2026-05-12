import type { db as database } from "@pkg/db";
import type { resetTestDatabase as resetDatabase } from "@pkg/db/test-utils";
import { setDefaultDatabaseTestEnv } from "@pkg/db/test-utils";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DuplicateProductNameError, ProductNotFoundError } from "./product-errors.js";
import { createProduct, listProducts, updateProduct } from "./product-service.js";

let db: typeof database;
let resetTestDatabase: typeof resetDatabase;
let closeDatabaseConnection: () => Promise<void>;

beforeAll(async () => {
  setDefaultDatabaseTestEnv();

  const dbModule = await import("@pkg/db");
  const testUtilsModule = await import("@pkg/db/test-utils");

  db = dbModule.db;
  closeDatabaseConnection = dbModule.closeDatabaseConnection;
  resetTestDatabase = testUtilsModule.resetTestDatabase;
});

beforeEach(async () => {
  await resetTestDatabase();
});

afterAll(async () => {
  await closeDatabaseConnection();
});

describe("product service", () => {
  it("creates and lists products with default name sorting", async () => {
    await createProduct(db, { name: "Z Loader" });
    await createProduct(db, { name: "A Bucket" });

    const result = await listProducts(db);

    expect(result.items.map((product) => product.name)).toEqual(["A Bucket", "Z Loader"]);
    expect(result.total).toBe(2);
    expect(result.page).toBe(1);
    expect(result.pageCount).toBe(1);
  });

  it("trims product names on create and update", async () => {
    const created = await createProduct(db, { name: "  Compact Loader  " });

    expect(created.name).toBe("Compact Loader");

    const updated = await updateProduct(db, {
      id: created.id,
      name: "  Compact Loader Plus  ",
    });

    expect(updated.name).toBe("Compact Loader Plus");
  });

  it("pages and sorts products", async () => {
    await createProduct(db, { name: "Alpha" });
    await createProduct(db, { name: "Bravo" });
    await createProduct(db, { name: "Charlie" });

    const result = await listProducts(db, {
      page: 2,
      pageSize: 2,
      columnFilters: {},
      search: "",
      sortBy: "name",
      sortDirection: "asc",
    });

    expect(result.items.map((product) => product.name)).toEqual(["Charlie"]);
    expect(result.total).toBe(3);
    expect(result.pageCount).toBe(2);
  });

  it("searches product names case-insensitively", async () => {
    await createProduct(db, { name: "Compact Loader" });
    await createProduct(db, { name: "Excavator Bucket" });
    await createProduct(db, { name: "Wheel LOADER" });

    const result = await listProducts(db, {
      page: 1,
      pageSize: 10,
      columnFilters: {},
      search: "loader",
      sortBy: "name",
      sortDirection: "asc",
    });

    expect(result.items.map((product) => product.name)).toEqual(["Compact Loader", "Wheel LOADER"]);
    expect(result.total).toBe(2);
    expect(result.pageCount).toBe(1);
  });

  it("applies search before paging and counting", async () => {
    await createProduct(db, { name: "Alpha Loader" });
    await createProduct(db, { name: "Bravo Loader" });
    await createProduct(db, { name: "Charlie Loader" });
    await createProduct(db, { name: "Excavator" });

    const result = await listProducts(db, {
      page: 2,
      pageSize: 2,
      columnFilters: {},
      search: "loader",
      sortBy: "name",
      sortDirection: "asc",
    });

    expect(result.items.map((product) => product.name)).toEqual(["Charlie Loader"]);
    expect(result.total).toBe(3);
    expect(result.pageCount).toBe(2);
  });

  it("searches product names and IDs globally", async () => {
    const loader = await createProduct(db, { name: "Compact Loader" });
    await createProduct(db, { name: "Excavator Bucket" });

    const nameResult = await listProducts(db, {
      page: 1,
      pageSize: 10,
      columnFilters: {},
      search: "loader",
      sortBy: "name",
      sortDirection: "asc",
    });
    const idResult = await listProducts(db, {
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

  it("filters product lists by name column filter", async () => {
    await createProduct(db, { name: "Compact Loader" });
    await createProduct(db, { name: "Wheel Loader" });
    await createProduct(db, { name: "Excavator Bucket" });

    const result = await listProducts(db, {
      page: 1,
      pageSize: 10,
      columnFilters: {
        name: "loader",
      },
      search: "",
      sortBy: "name",
      sortDirection: "asc",
    });

    expect(result.items.map((product) => product.name)).toEqual(["Compact Loader", "Wheel Loader"]);
    expect(result.total).toBe(2);
  });

  it("filters product lists by id column filter", async () => {
    const loader = await createProduct(db, { name: "Compact Loader" });
    await createProduct(db, { name: "Excavator Bucket" });

    const result = await listProducts(db, {
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

  it("combines global search and column filters before paging and counting", async () => {
    await createProduct(db, { name: "Alpha Loader" });
    await createProduct(db, { name: "Bravo Loader" });
    await createProduct(db, { name: "Bravo Excavator" });
    await createProduct(db, { name: "Charlie Loader" });

    const result = await listProducts(db, {
      page: 1,
      pageSize: 10,
      columnFilters: {
        name: "bravo",
      },
      search: "loader",
      sortBy: "name",
      sortDirection: "asc",
    });

    expect(result.items.map((product) => product.name)).toEqual(["Bravo Loader"]);
    expect(result.total).toBe(1);
    expect(result.pageCount).toBe(1);
  });

  it("rejects duplicate product names", async () => {
    await createProduct(db, { name: "Duplicate" });

    await expect(createProduct(db, { name: "Duplicate" })).rejects.toBeInstanceOf(
      DuplicateProductNameError,
    );
  });

  it("rejects updates to missing products", async () => {
    await expect(
      updateProduct(db, {
        id: "00000000-0000-4000-8000-000000000001",
        name: "Missing",
      }),
    ).rejects.toBeInstanceOf(ProductNotFoundError);
  });
});
