import { expect } from "vitest";

import { Tester } from "@/test/Tester.js";
import type { Context } from "@/trpc/context.js";
import type { AppRouter } from "@/trpc/router.js";

type ProductRouterTestContext = {
  createCaller: (session?: Context["session"]) => ReturnType<AppRouter["createCaller"]>;
};

const { test } = new Tester<ProductRouterTestContext>(async ({ cleanup }) => {
  const { closeDatabaseConnection, db } = await import("@pkg/db");
  const { createAppRouterCaller } = await import("@/trpc/router.js");

  cleanup(closeDatabaseConnection);

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

test("rejects unauthenticated product lists", async ({ context }) => {
  const caller = context.createCaller(null);

  await expect(caller.products.list({})).rejects.toMatchObject({
    code: "UNAUTHORIZED",
  });
});

test("creates, lists, and updates products for authenticated users", async ({ context }) => {
  const caller = context.createCaller();
  const created = await caller.products.create({
    name: "Wheel Loader",
  });

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

  const updated = await caller.products.update({
    id: created.id,
    name: "Wheel Loader XL",
  });

  expect(updated).toEqual({
    id: created.id,
    name: "Wheel Loader XL",
  });
});

test("filters product lists by name search for authenticated users", async ({ context }) => {
  const caller = context.createCaller();
  const loader = await caller.products.create({
    name: "Compact Loader",
  });
  await caller.products.create({
    name: "Excavator Bucket",
  });

  const listResult = await caller.products.list({
    page: 1,
    pageSize: 10,
    columnFilters: {},
    search: "loader",
    sortBy: "name",
    sortDirection: "asc",
  });

  expect(listResult.items).toEqual([loader]);
  expect(listResult.total).toBe(1);
});

test("returns conflict for duplicate product names", async ({ context }) => {
  const caller = context.createCaller();

  await caller.products.create({
    name: "Duplicate Product",
  });

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
  const createResult = await caller.products.create({
    name: "Reusable Isolated Name",
  });

  expect(createResult.name).toBe("Reusable Isolated Name");
});

test("allows the same product name in another isolated test database", async ({ context }) => {
  const caller = context.createCaller();
  const createResult = await caller.products.create({
    name: "Reusable Isolated Name",
  });

  expect(createResult.name).toBe("Reusable Isolated Name");
});
