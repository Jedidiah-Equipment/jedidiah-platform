import type { IncomingHttpHeaders } from "node:http";
import type { Database } from "@pkg/db";
import { afterEach, describe, expect, test, vi } from "vitest";

import { mockSession } from "@/test/test-utils.js";

const { getSessionFromHeadersMock } = vi.hoisted(() => ({
  getSessionFromHeadersMock: vi.fn(),
}));

vi.mock("./session.js", () => ({
  getSessionFromHeaders: getSessionFromHeadersMock,
}));

import { createContext } from "../trpc/context.js";
import { createRequestContext, createRequestContextFromSession } from "./request-context.js";

afterEach(() => {
  vi.clearAllMocks();
});

describe("createRequestContextFromSession", () => {
  test("returns the same session, access summary, and db handle shape as protected procedures", () => {
    const db = {} as unknown as Database;
    const session = mockSession("product-editor");

    const context = createRequestContextFromSession({
      db,
      session,
    });

    expect(context).toEqual({
      access: {
        permissions: ["product:create", "product:read", "product:update"],
        role: "product-editor",
        userId: session.user.id,
      },
      db,
      session,
    });
  });

  test("returns null session and access when no session exists", () => {
    const db = {} as unknown as Database;

    const context = createRequestContextFromSession({
      db,
      session: null,
    });

    expect(context).toEqual({
      access: null,
      db,
      session: null,
    });
  });
});

describe("createRequestContext", () => {
  test("uses the shared boundary for authenticated requests", async () => {
    const db = {} as unknown as Database;
    const session = mockSession("admin");
    const headers = { cookie: "test-cookie" } as IncomingHttpHeaders;

    getSessionFromHeadersMock.mockResolvedValue(session);

    const context = await createRequestContext({
      db,
      headers,
    });

    expect(getSessionFromHeadersMock).toHaveBeenCalledOnce();
    expect(getSessionFromHeadersMock).toHaveBeenCalledWith(headers);
    expect(context).toEqual({
      access: {
        permissions: [
          "audit:read",
          "product:create",
          "product:read",
          "product:update",
          "user:create",
          "user:list",
          "user:set-password",
          "user:set-role",
          "user:update",
        ],
        role: "admin",
        userId: session.user.id,
      },
      db,
      session,
    });
  });

  test("keeps unauthenticated requests at a null session boundary", async () => {
    const db = {} as unknown as Database;
    const headers = { cookie: "test-cookie" } as IncomingHttpHeaders;

    getSessionFromHeadersMock.mockResolvedValue(null);

    const context = await createRequestContext({
      db,
      headers,
    });

    expect(getSessionFromHeadersMock).toHaveBeenCalledOnce();
    expect(context).toEqual({
      access: null,
      db,
      session: null,
    });
  });
});

describe("createContext", () => {
  test("delegates to the shared request context path without changing the db handle", async () => {
    const db = {} as unknown as Database;
    const session = mockSession("product-viewer");
    const headers = { cookie: "test-cookie" } as IncomingHttpHeaders;

    getSessionFromHeadersMock.mockResolvedValue(session);

    const context = await createContext({
      db,
      req: {
        headers,
      },
    } as Parameters<typeof createContext>[0]);

    expect(getSessionFromHeadersMock).toHaveBeenCalledOnce();
    expect(context.db).toBe(db);
    expect(context.session).toBe(session);
    expect(context.access).toEqual({
      permissions: ["product:read"],
      role: "product-viewer",
      userId: session.user.id,
    });
  });
});
