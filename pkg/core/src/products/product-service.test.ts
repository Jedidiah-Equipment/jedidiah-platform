import type { db as database } from "@pkg/db";
import type { resetTestDatabase as resetDatabase } from "@pkg/db/test-utils";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { DuplicateProductNameError, ProductNotFoundError } from "./product-errors.js";
import { createProduct, listProducts, updateProduct } from "./product-service.js";

let db: typeof database;
let resetTestDatabase: typeof resetDatabase;
let closeDatabaseConnection: () => Promise<void>;

beforeAll(async () => {
  process.env.NODE_ENV = "test";
  process.env.DATABASE_URL ??= "postgres://app:app@localhost:5432/app_dev";
  process.env.TEST_DATABASE_URL ??= "postgres://app:app@localhost:5432/app_test";

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
      sortBy: "name",
      sortDirection: "asc",
    });

    expect(result.items.map((product) => product.name)).toEqual(["Charlie"]);
    expect(result.total).toBe(3);
    expect(result.pageCount).toBe(2);
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
