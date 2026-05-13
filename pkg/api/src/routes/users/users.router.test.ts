import type { Database } from "@pkg/db";
import { account, user } from "@pkg/db/schema";
import type { AppRole } from "@pkg/schema";
import { hashPassword } from "better-auth/crypto";
import { describe, expect } from "vitest";

import { createTester, type TesterContext, type TesterScope } from "@/test/create-tester.js";
import { mockSession } from "@/test/test-utils.js";

const test = createTester(({ auth, db }) => ({ auth, db }));

type AdminCallerContext = {
  auth: TesterScope["auth"];
  db: Database;
  createCaller: TesterContext["createCaller"];
};

describe("users.list", () => {
  test("rejects unauthenticated user lists", async ({ context }) => {
    await expect(context.createAnonCaller().users.list()).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("allows admins to list safe user summaries", async ({ context }) => {
    await createUser(context.db, {
      email: "viewer@example.com",
      emailVerified: true,
      id: "viewer-user-id",
      name: "Viewer User",
      role: "product-viewer",
    });

    const result = await context.createCaller().users.list();

    expect(result.users).toEqual([
      {
        email: "viewer@example.com",
        emailVerified: true,
        id: "viewer-user-id",
        name: "Viewer User",
        role: "product-viewer",
      },
    ]);
  });

  test("defaults unknown stored roles in list responses", async ({ context }) => {
    await createUser(context.db, {
      email: "legacy@example.com",
      emailVerified: false,
      id: "legacy-user-id",
      name: "Legacy User",
      role: "user",
    });

    const result = await context.createCaller().users.list();

    expect(result.users).toEqual([
      {
        email: "legacy@example.com",
        emailVerified: false,
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

describe("users.create", () => {
  test("rejects unauthenticated user creates", async ({ context }) => {
    await expect(
      context.createAnonCaller().users.create({
        email: "viewer@example.com",
        emailVerified: true,
        name: "Viewer User",
        password: "12345678",
        role: "product-viewer",
      }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("rejects non-admin user creates", async ({ context }) => {
    const caller = context.createCaller(mockSession("product-editor"));

    await expect(
      caller.users.create({
        email: "viewer@example.com",
        emailVerified: true,
        name: "Viewer User",
        password: "12345678",
        role: "product-viewer",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("allows admins to create users", async ({ context }) => {
    const caller = await createAdminCaller(context);

    const result = await caller.users.create({
      email: "viewer@example.com",
      emailVerified: true,
      name: "Viewer User",
      password: "12345678",
      role: "product-viewer",
    });

    expect(result).toMatchObject({
      email: "viewer@example.com",
      emailVerified: true,
      name: "Viewer User",
      role: "product-viewer",
    });
  });

  for (const input of [
    { emailVerified: true, email: "verified@example.com" },
    { emailVerified: false, email: "unverified@example.com" },
  ]) {
    test(`respects emailVerified: ${input.emailVerified}`, async ({ context }) => {
      const caller = await createAdminCaller(context);

      const result = await caller.users.create({
        email: input.email,
        emailVerified: input.emailVerified,
        name: "Viewer User",
        password: "12345678",
        role: "product-viewer",
      });

      expect(result.emailVerified).toBe(input.emailVerified);
    });
  }

  test("returns conflict for duplicate email", async ({ context }) => {
    await createUser(context.db, {
      email: "viewer@example.com",
      id: "viewer-user-id",
      name: "Viewer User",
      role: "product-viewer",
    });
    const caller = await createAdminCaller(context);

    await expect(
      caller.users.create({
        email: "viewer@example.com",
        emailVerified: true,
        name: "Other User",
        password: "12345678",
        role: "product-viewer",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Email is already in use.",
    });
  });
});

describe("users.update", () => {
  test("rejects unauthenticated user updates", async ({ context }) => {
    await expect(
      context.createAnonCaller().users.update({
        email: "viewer@example.com",
        emailVerified: true,
        name: "Viewer User",
        role: "product-viewer",
        userId: "viewer-user-id",
      }),
    ).rejects.toMatchObject({
      code: "UNAUTHORIZED",
    });
  });

  test("rejects non-admin user updates", async ({ context }) => {
    const caller = context.createCaller(mockSession("product-editor"));

    await expect(
      caller.users.update({
        email: "viewer@example.com",
        emailVerified: true,
        name: "Viewer User",
        role: "product-viewer",
        userId: "viewer-user-id",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
    });
  });

  test("updates name, email, role, and email verification status", async ({ context }) => {
    await createUser(context.db, {
      email: "viewer@example.com",
      emailVerified: false,
      id: "viewer-user-id",
      name: "Viewer User",
      role: "product-viewer",
    });
    const caller = await createAdminCaller(context);

    const result = await caller.users.update({
      email: "editor@example.com",
      emailVerified: true,
      name: "Editor User",
      role: "product-editor",
      userId: "viewer-user-id",
    });

    expect(result).toEqual({
      email: "editor@example.com",
      emailVerified: true,
      id: "viewer-user-id",
      name: "Editor User",
      role: "product-editor",
    });
  });

  test("updates the credential account password when provided", async ({ context }) => {
    await createUser(context.db, {
      email: "viewer@example.com",
      id: "viewer-user-id",
      name: "Viewer User",
      password: "12345678",
      role: "product-viewer",
    });
    const caller = await createAdminCaller(context);

    await caller.users.update({
      email: "viewer@example.com",
      emailVerified: true,
      name: "Viewer User",
      password: "87654321",
      role: "product-viewer",
      userId: "viewer-user-id",
    });

    await expect(
      context.auth.api.signInEmail({
        body: {
          email: "viewer@example.com",
          password: "87654321",
        },
      }),
    ).resolves.toMatchObject({
      user: {
        id: "viewer-user-id",
      },
    });
  });

  test("rejects self-demotion", async ({ context }) => {
    const session = mockSession("admin");

    await expect(
      context.createCaller(session).users.update({
        email: session.user.email,
        emailVerified: session.user.emailVerified,
        name: session.user.name,
        role: "product-viewer",
        userId: session.user.id,
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot change your own role.",
    });
  });

  test("allows editing yourself when the role is unchanged", async ({ context }) => {
    const session = mockSession("admin");
    await createUser(context.db, {
      email: session.user.email,
      id: session.user.id,
      name: session.user.name,
      role: "admin",
    });
    const caller = await createAdminCaller(context, session);

    const result = await caller.users.update({
      email: "renamed-admin@example.com",
      emailVerified: true,
      name: "Renamed Admin",
      role: "admin",
      userId: session.user.id,
    });

    expect(result).toMatchObject({
      email: "renamed-admin@example.com",
      name: "Renamed Admin",
      role: "admin",
    });
  });

  test("rejects demoting the last admin", async ({ context }) => {
    await createUser(context.db, {
      email: "admin@example.com",
      id: "other-admin-user-id",
      name: "Other Admin",
      role: "admin",
    });
    const caller = context.createCaller();

    await expect(
      caller.users.update({
        email: "admin@example.com",
        emailVerified: true,
        name: "Other Admin",
        role: "product-viewer",
        userId: "other-admin-user-id",
      }),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "You cannot remove the last admin.",
    });
  });

  test("returns not found for missing users", async ({ context }) => {
    const caller = await createAdminCaller(context);

    await expect(
      caller.users.update({
        email: "missing@example.com",
        emailVerified: true,
        name: "Missing User",
        role: "product-viewer",
        userId: "missing-user-id",
      }),
    ).rejects.toMatchObject({
      code: "NOT_FOUND",
      message: "User not found.",
    });
  });

  test("returns conflict for duplicate email", async ({ context }) => {
    await createUser(context.db, {
      email: "viewer@example.com",
      id: "viewer-user-id",
      name: "Viewer User",
      role: "product-viewer",
    });
    await createUser(context.db, {
      email: "editor@example.com",
      id: "editor-user-id",
      name: "Editor User",
      role: "product-editor",
    });
    const caller = await createAdminCaller(context);

    await expect(
      caller.users.update({
        email: "editor@example.com",
        emailVerified: true,
        name: "Viewer User",
        role: "product-viewer",
        userId: "viewer-user-id",
      }),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: "Email is already in use.",
    });
  });
});

async function createAdminCaller(context: AdminCallerContext, session = mockSession("admin")) {
  await createUser(context.db, {
    email: session.user.email,
    id: session.user.id,
    name: session.user.name,
    password: "12345678",
    role: "admin",
  });

  const { headers } = await context.auth.api.signInEmail({
    body: {
      email: session.user.email,
      password: "12345678",
    },
    returnHeaders: true,
  });

  return context.createCaller(session, convertSetCookieToCookie(headers));
}

function convertSetCookieToCookie(headers: Headers): Headers {
  const cookieHeaders = new Headers(headers);
  const cookies = cookieHeaders.get("cookie") ? [cookieHeaders.get("cookie") ?? ""] : [];

  cookieHeaders.forEach((value, key) => {
    if (key.toLowerCase() === "set-cookie") {
      cookies.push(value.split(";")[0]?.trim() ?? "");
    }
  });

  cookieHeaders.set("cookie", cookies.filter(Boolean).join("; "));
  return cookieHeaders;
}

async function createUser(
  db: Database,
  input: {
    email: string;
    emailVerified?: boolean;
    id: string;
    name: string;
    password?: string;
    role: AppRole | string;
  },
) {
  const now = new Date();

  await db
    .insert(user)
    .values({
      email: input.email,
      emailVerified: input.emailVerified ?? true,
      id: input.id,
      name: input.name,
      role: input.role,
      createdAt: now,
      updatedAt: now,
    })
    .onConflictDoNothing();

  if (!input.password) {
    return;
  }

  await db
    .insert(account)
    .values({
      accountId: input.id,
      createdAt: now,
      id: `${input.id}-credential-account`,
      password: await hashPassword(input.password),
      providerId: "credential",
      updatedAt: now,
      userId: input.id,
    })
    .onConflictDoNothing();
}
