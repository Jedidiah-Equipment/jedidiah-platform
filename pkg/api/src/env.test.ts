import { describe, expect, it } from "vitest";

import { getApiConfig } from "./env.js";

const validEnv = {
  NODE_ENV: "development",
  DATABASE_URL: "postgres://app:app@localhost:5432/app_dev",
  TEST_DATABASE_URL: "postgres://app:app@localhost:5432/app_test",
  APP_BASE_URL: "http://localhost:7001",
  API_BASE_URL: "http://localhost:7002",
  AUTH_SECRET: "local-auth-secret-must-be-at-least-thirty-two-chars",
  AUTH_TRUSTED_ORIGINS: "http://localhost:7001, http://localhost:7002",
  PORT: "7002",
};

describe("getApiConfig", () => {
  it("parses valid API config", () => {
    expect(getApiConfig(validEnv)).toMatchObject({
      NODE_ENV: "development",
      APP_BASE_URL: "http://localhost:7001",
      API_BASE_URL: "http://localhost:7002",
      PORT: 7002,
    });
  });

  it("splits and trims trusted origins", () => {
    expect(getApiConfig(validEnv).AUTH_TRUSTED_ORIGINS).toEqual([
      "http://localhost:7001",
      "http://localhost:7002",
    ]);
  });

  it("fails when AUTH_SECRET is missing", () => {
    const { AUTH_SECRET: _authSecret, ...envWithoutSecret } = validEnv;

    expect(() => getApiConfig(envWithoutSecret)).toThrow();
  });
});
