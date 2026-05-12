import type { Database } from "@pkg/db";
import { user } from "@pkg/db/schema";
import type { AppRole } from "@pkg/schema";
import { describe, expect } from "vitest";

import { createTester } from "@/test/create-tester.js";
import { mockSession } from "@/test/test-utils.js";

const test = createTester(({ db }) => ({ db }));

describe("users.list", () => {
  test("rejects unauthenticated user lists", async ({ context }) => {
    await expect(context.createAnonCaller().users.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("allows admins to list safe user summaries", async ({ context }) => {
    await createUser(context.db, {
      email: "viewer@example.com",
      id: "viewer-user-id",
      name: "Viewer User",
      role: "product-viewer",
    });

    const result = await context.createCaller().users.list();

    expect(result.users).toEqual([
      {
        email: "viewer@example.com",
        id: "viewer-user-id",
        name: "Viewer User",
        role: "product-viewer",
      },
    ]);
  });

  test("defaults unknown stored roles in list responses", async ({ context }) => {
    await createUser(context.db, {
      email: "legacy@example.com",
      id: "legacy-user-id",
      name: "Legacy User",
      role: "user",
    });

    const result = await context.createCaller().users.list();

    expect(result.users).toEqual([
      {
        email: "legacy@example.com",
        id: "legacy-user-id",
        name: "Legacy User",
        role: "product-viewer",
      },
    ]);
  });

  test("rejects product editors", async ({ context }) => {
    const caller = context.createCaller(mockSession("product-editor"));

    await expect(caller.users.list()).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });
});

describe("users.setRole", () => {
  test("rejects unauthenticated role changes", async ({ context }) => {
    await expect(
      context.createAnonCaller().users.setRole({
        role: "product-viewer",
        userId: "viewer-user-id",
      }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("allows admins to change another user's role", async ({ context }) => {
    await createUser(context.db, {
      email: "viewer@example.com",
      id: "viewer-user-id",
      name: "Viewer User",
      role: "product-viewer",
    });

    const result = await context.createCaller().users.setRole({
      role: "product-editor",
      userId: "viewer-user-id",
    });

    expect(result.role).toBe("product-editor");
  });

  test("rejects non-admin role changes", async ({ context }) => {
    const caller = context.createCaller(mockSession("product-editor"));

    await expect(
      caller.users.setRole({
        role: "product-viewer",
        userId: "viewer-user-id",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("rejects self-demotion", async ({ context }) => {
    const session = mockSession("admin");

    await expect(
      context.createCaller(session).users.setRole({
        role: "product-viewer",
        userId: session.user.id,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot change your own role.",
    });
  });

  test("rejects demoting the last admin", async ({ context }) => {
    await createUser(context.db, {
      email: "admin@example.com",
      id: "other-admin-user-id",
      name: "Other Admin",
      role: "admin",
    });

    await expect(
      context.createCaller().users.setRole({
        role: "product-viewer",
        userId: "other-admin-user-id",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot remove the last admin.",
    });
  });

  test("returns not found for missing users", async ({ context }) => {
    await expect(
      context.createCaller().users.setRole({
        role: "product-viewer",
        userId: "missing-user-id",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "User not found.",
    });
  });
});

async function createUser(
  db: Database,
  input: {
    email: string;
    id: string;
    name: string;
    role: AppRole | string;
  },
) {
  await db.insert(user).values({
    ...input,
    createdAt: new Date(),
    emailVerified: true,
    updatedAt: new Date(),
  });
}
