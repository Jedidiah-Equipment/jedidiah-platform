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
