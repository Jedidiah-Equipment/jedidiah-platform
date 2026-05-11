import type { LightMyRequestResponse } from "fastify";
import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { getMockEmailMessages } from "../email/mock-email.js";
import {
  closeIntegrationState,
  cookieHeader,
  getTestApp,
  resetIntegrationState,
  signIn,
  signUp,
  testOrigin,
  uniqueEmail,
} from "../test/integration.js";

beforeEach(async () => {
  await resetIntegrationState();
});

afterAll(async () => {
  await closeIntegrationState();
});

describe("tRPC auth router", () => {
  it("returns null for an unauthenticated session", async () => {
    const response = await (await getTestApp()).inject({
      method: "GET",
      url: "/trpc/auth.session",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().result.data).toBeNull();
  });

  it("rejects unauthenticated protected user lookup", async () => {
    const response = await (await getTestApp()).inject({
      method: "GET",
      url: "/trpc/auth.me",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe(-32001);
  });
});

describe("tRPC products router", () => {
  it("rejects unauthenticated product lists", async () => {
    const response = await (await getTestApp()).inject({
      method: "GET",
      url: "/trpc/products.list",
    });

    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe(-32001);
  });

  it("creates, lists, and updates products for authenticated users", async () => {
    const cookie = await authenticatedCookie("products");

    const createResponse = await trpcRequest("products.create", cookie, {
      name: "Wheel Loader",
    });

    expect(createResponse.statusCode).toBe(200);

    const created = trpcData(createResponse);

    expect(created.name).toBe("Wheel Loader");

    const listResponse = await trpcQuery("products.list", cookie, {
      page: 1,
      pageSize: 10,
      sortBy: "name",
      sortDirection: "asc",
    });

    expect(listResponse.statusCode).toBe(200);
    expect(trpcData(listResponse).items).toEqual([created]);

    const updateResponse = await trpcRequest("products.update", cookie, {
      id: created.id,
      name: "Wheel Loader XL",
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(trpcData(updateResponse)).toEqual({
      id: created.id,
      name: "Wheel Loader XL",
    });
  });

  it("returns conflict for duplicate product names", async () => {
    const cookie = await authenticatedCookie("duplicate-product");

    await trpcRequest("products.create", cookie, {
      name: "Duplicate Product",
    });

    const duplicateResponse = await trpcRequest("products.create", cookie, {
      name: "Duplicate Product",
    });

    expect(duplicateResponse.statusCode).toBe(409);
    expect(duplicateResponse.json().error.message).toBe("A product with this name already exists.");
  });
});

describe("Better Auth endpoints", () => {
  it("signs up with email and password", async () => {
    const response = await signUp(uniqueEmail("signup"));

    expect(response.statusCode).toBe(200);
    expect(response.headers["set-cookie"]).toBeDefined();
  });

  it("signs in and reads the current session", async () => {
    const email = uniqueEmail("signin");

    await signUp(email);
    const signInResponse = await signIn(email);
    const cookie = cookieHeader(signInResponse.headers["set-cookie"]);

    expect(signInResponse.statusCode).toBe(200);
    expect(cookie).toContain("better-auth");

    const sessionResponse = await (await getTestApp()).inject({
      method: "GET",
      url: "/api/auth/get-session",
      headers: {
        cookie,
        origin: testOrigin,
      },
    });

    expect(sessionResponse.statusCode).toBe(200);
    expect(sessionResponse.json().user.email).toBe(email);
  });

  it("signs out", async () => {
    const email = uniqueEmail("signout");

    await signUp(email);
    const signInResponse = await signIn(email);
    const cookie = cookieHeader(signInResponse.headers["set-cookie"]);

    const signOutResponse = await (await getTestApp()).inject({
      method: "POST",
      url: "/api/auth/sign-out",
      headers: {
        cookie,
        origin: testOrigin,
      },
    });

    expect(signOutResponse.statusCode).toBe(200);
  });

  it("records a mocked password reset email", async () => {
    const email = uniqueEmail("reset");

    await signUp(email);
    const response = await (await getTestApp()).inject({
      method: "POST",
      url: "/api/auth/request-password-reset",
      headers: {
        origin: testOrigin,
      },
      payload: {
        email,
        redirectTo: "http://localhost:7001/reset-password",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(getMockEmailMessages()).toEqual([
      expect.objectContaining({
        to: email,
        type: "password-reset",
      }),
    ]);
  });

  it("records a mocked email verification email", async () => {
    const email = uniqueEmail("verify");

    await signUp(email);
    const response = await (await getTestApp()).inject({
      method: "POST",
      url: "/api/auth/send-verification-email",
      headers: {
        origin: testOrigin,
      },
      payload: {
        email,
        callbackURL: "http://localhost:7001/verify-email",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(getMockEmailMessages()).toEqual([
      expect.objectContaining({
        to: email,
        type: "email-verification",
      }),
    ]);
  });
});

async function authenticatedCookie(prefix: string): Promise<string> {
  const email = uniqueEmail(prefix);

  await signUp(email);
  const signInResponse = await signIn(email);

  return cookieHeader(signInResponse.headers["set-cookie"]);
}

async function trpcRequest(
  path: string,
  cookie: string,
  input: Record<string, unknown>,
): Promise<LightMyRequestResponse> {
  return await (await getTestApp()).inject({
    method: "POST",
    url: `/trpc/${path}`,
    headers: {
      cookie,
    },
    payload: input,
  });
}

async function trpcQuery(
  path: string,
  cookie: string,
  input: Record<string, unknown>,
): Promise<LightMyRequestResponse> {
  return await (await getTestApp()).inject({
    method: "GET",
    url: `/trpc/${path}?input=${encodeURIComponent(JSON.stringify(input))}`,
    headers: {
      cookie,
    },
  });
}

function trpcData(response: Awaited<ReturnType<typeof trpcRequest>>) {
  return response.json().result.data;
}
