import { closeDatabaseConnection } from "@app/db";
import { resetTestDatabase } from "@app/db/test-utils";
import type { FastifyInstance, LightMyRequestResponse } from "fastify";

import { clearMockEmailMessages } from "../email/mock-email.js";
import { buildServer } from "../server.js";

let app: FastifyInstance | undefined;

export const testOrigin = "http://localhost:5173";
export const testPassword = "password1234";

export function uniqueEmail(prefix: string): string {
  return `${prefix}-${crypto.randomUUID()}@example.com`;
}

export function cookieHeader(setCookie: string | string[] | undefined): string {
  const cookies = Array.isArray(setCookie) ? setCookie : setCookie ? [setCookie] : [];

  return cookies.map((cookie) => cookie.split(";")[0]).join("; ");
}

export async function getTestApp(): Promise<FastifyInstance> {
  app ??= await buildServer();
  return app;
}

export async function resetIntegrationState(): Promise<void> {
  clearMockEmailMessages();
  await resetTestDatabase();
}

export async function closeIntegrationState(): Promise<void> {
  await app?.close();
  app = undefined;
  await closeDatabaseConnection();
}

export async function signUp(email: string): Promise<LightMyRequestResponse> {
  const server = await getTestApp();

  return server.inject({
    method: "POST",
    url: "/api/auth/sign-up/email",
    headers: {
      origin: testOrigin,
    },
    payload: {
      name: "Test User",
      email,
      password: testPassword,
    },
  });
}

export async function signIn(email: string): Promise<LightMyRequestResponse> {
  const server = await getTestApp();

  return server.inject({
    method: "POST",
    url: "/api/auth/sign-in/email",
    headers: {
      origin: testOrigin,
    },
    payload: {
      email,
      password: testPassword,
    },
  });
}
