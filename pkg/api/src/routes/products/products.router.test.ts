import type { Database } from "@pkg/db";
import { auditEvents, user } from "@pkg/db/schema";
import type { Product } from "@pkg/schema";
import { describe, expect } from "vitest";

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

function createModelCode(name: string): string {
  return name
    .trim()
    .toUpperCase()
    .replace(/[^A-Z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

describe("products.create", () => {
  test("rejects unauthenticated product creates", async ({ context }) => {
    await expect(
      context.createAnonCaller().products.create({
        basePrice: 1_000,
        modelCode: "ANON-100",
        name: "Anonymous Product",
      }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("creates products", async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, "Wheel Loader");

    expect(created.name).toBe("Wheel Loader");
    expect(created).toMatchObject({
      basePrice: 1_000,
      currencyCode: "ZAR",
      description: null,
      modelCode: "WHEEL-LOADER",
      name: "Wheel Loader",
    });
    expect(created.createdAt).toBeInstanceOf(Date);
    expect(created.updatedAt).toBeInstanceOf(Date);
  });

  test("records an audit event for product creates", async ({ context }) => {
    const session = mockSession("admin");
    const caller = context.createCaller(session);
    const created = await createProduct(caller, "Wheel Loader");

    const events = await listAuditEvents(context.db);

    expect(events).toMatchObject([
      {
        action: "created",
        actorUserId: session.user.id,
        changes: null,
        entityId: created.id,
        entityType: "product",
        summary: 'Created product "Wheel Loader"',
      },
    ]);
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
        basePrice: 2_000,
        modelCode: "DUPLICATE-PRODUCT-2",
        name: "Duplicate Product",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "A product with this name already exists.",
    });
  });

  test("returns conflict for duplicate product model codes", async ({ context }) => {
    const caller = context.createCaller();

    await createProduct(caller, "Duplicate Product");

    await expect(
      caller.products.create({
        basePrice: 2_000,
        modelCode: "DUPLICATE-PRODUCT",
        name: "Duplicate Product Plus",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "A product with this model code already exists.",
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

    await expect(
      caller.products.create({
        basePrice: 1_000,
        modelCode: "READ-ONLY-PRODUCT",
        name: "Read Only Product",
      }),
    ).rejects.toMatchObject({
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

  test("searches product names, model codes, descriptions, and IDs globally", async ({
    context,
  }) => {
    const caller = context.createCaller();
    const loader = await createProduct(caller, "Compact Loader", {
      description: "Underground equipment loader",
      modelCode: "CL-100",
    });
    const bucket = await createProduct(caller, "Excavator Bucket", {
      description: "Digging attachment",
      modelCode: "EX-200",
    });
    await createProduct(caller, "Wheel Truck", {
      description: "Hauling equipment",
      modelCode: "WL-300",
    });

    const nameResult = await caller.products.list({
      page: 1,
      pageSize: 10,
      columnFilters: {},
      search: "loader",
      sortBy: "name",
      sortDirection: "asc",
    });
    const modelResult = await caller.products.list({
      page: 1,
      pageSize: 10,
      columnFilters: {},
      search: "ex-200",
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
    const descriptionResult = await caller.products.list({
      page: 2,
      pageSize: 1,
      columnFilters: {},
      search: "equipment",
      sortBy: "name",
      sortDirection: "asc",
    });

    expect(nameResult.items.map((product) => product.id)).toEqual([loader.id]);
    expect(modelResult.items.map((product) => product.id)).toEqual([bucket.id]);
    expect(idResult.items.map((product) => product.id)).toEqual([loader.id]);
    expect(productNames(descriptionResult.items)).toEqual(["Wheel Truck"]);
    expect(descriptionResult.total).toBe(2);
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

  test("filters and sorts product lists by catalog fields", async ({ context }) => {
    const caller = context.createCaller();
    await createProduct(caller, "Compact Loader", {
      basePrice: 250_000,
      modelCode: "CL-100",
    });
    await createProduct(caller, "Wheel Loader", {
      basePrice: 150_000,
      modelCode: "WL-200",
    });
    await createProduct(caller, "Excavator Bucket", {
      basePrice: 50_000,
      modelCode: "EX-300",
    });

    const modelResult = await caller.products.list({
      page: 1,
      pageSize: 10,
      columnFilters: {
        modelCode: "L-",
      },
      search: "",
      sortBy: "basePrice",
      sortDirection: "asc",
    });

    expect(productNames(modelResult.items)).toEqual(["Wheel Loader", "Compact Loader"]);
    expect(modelResult.total).toBe(2);
    expect(modelResult.sortBy).toBe("basePrice");
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
  test("rejects unauthenticated product updates", async ({ context }) => {
    await expect(
      context.createAnonCaller().products.update({
        basePrice: 1_000,
        id: "00000000-0000-4000-8000-000000000001",
        modelCode: "ANON-UPDATE",
        name: "Anonymous Update",
      }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("updates products", async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, "Wheel Loader");

    const updated = await caller.products.update({
      basePrice: 2_000,
      description: "Larger loader",
      id: created.id,
      modelCode: "WL-XL",
      name: "Wheel Loader XL",
    });

    expect(updated).toMatchObject({
      basePrice: 2_000,
      currencyCode: "ZAR",
      description: "Larger loader",
      id: created.id,
      modelCode: "WL-XL",
      name: "Wheel Loader XL",
    });
    expect(updated.updatedAt.getTime()).toBeGreaterThanOrEqual(created.updatedAt.getTime());
  });

  test("records changed fields in audit events for product updates", async ({ context }) => {
    const session = mockSession("admin");
    const caller = context.createCaller(session);
    const created = await createProduct(caller, "Wheel Loader");

    await caller.products.update({
      basePrice: 2_000,
      description: "Larger loader",
      id: created.id,
      modelCode: "WL-XL",
      name: "Wheel Loader XL",
    });

    const events = await listAuditEvents(context.db);

    expect(events).toMatchObject([
      {
        action: "created",
        changes: null,
      },
      {
        action: "updated",
        actorUserId: session.user.id,
        changes: {
          basePrice: {
            from: 1000,
            to: 2000,
          },
          description: {
            from: null,
            to: "Larger loader",
          },
          modelCode: {
            from: "WHEEL-LOADER",
            to: "WL-XL",
          },
          name: {
            from: "Wheel Loader",
            to: "Wheel Loader XL",
          },
        },
        entityId: created.id,
        entityType: "product",
        summary: 'Renamed product "Wheel Loader" to "Wheel Loader XL"',
      },
    ]);
  });

  test("trims product names", async ({ context }) => {
    const caller = context.createCaller();
    const created = await createProduct(caller, "Compact Loader");

    const updated = await caller.products.update({
      basePrice: created.basePrice,
      description: created.description,
      id: created.id,
      modelCode: created.modelCode,
      name: "  Compact Loader Plus  ",
    });

    expect(updated.name).toBe("Compact Loader Plus");
  });

  test("returns not found for missing product updates", async ({ context }) => {
    const caller = context.createCaller();

    await expect(
      caller.products.update({
        basePrice: 1_000,
        id: "00000000-0000-4000-8000-000000000001",
        modelCode: "MISSING",
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
      basePrice: created.basePrice,
      description: created.description,
      id: created.id,
      modelCode: created.modelCode,
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
        basePrice: created.basePrice,
        description: created.description,
        id: created.id,
        modelCode: created.modelCode,
        name: "Viewer Update Product Plus",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

async function listAuditEvents(db: Database) {
  return db.select().from(auditEvents).orderBy(auditEvents.occurredAt);
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
