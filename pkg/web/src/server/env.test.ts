import { describe, expect, it } from "vitest";

import { getInjectedClientConfig, getServerConfig } from "./env.js";

const validEnv = {
  APP_ENV: "development",
  PORT: "7001",
  PUBLIC_APP_BASE_URL: "http://localhost:7001",
  PUBLIC_API_BASE_URL: "http://localhost:7002",
  PUBLIC_AUTH_BASE_URL: "http://localhost:7002/api/auth",
};

describe("web server config", () => {
  it("parses server config separately from injected client config", () => {
    expect(getServerConfig(validEnv)).toEqual({
      port: 7001,
      clientConfig: {
        appEnv: "development",
        appBaseUrl: "http://localhost:7001",
        apiBaseUrl: "http://localhost:7002",
        authBaseUrl: "http://localhost:7002/api/auth",
      },
    });
  });

  it("returns only the injected client config", () => {
    expect(getInjectedClientConfig(validEnv)).toEqual({
      appEnv: "development",
      appBaseUrl: "http://localhost:7001",
      apiBaseUrl: "http://localhost:7002",
      authBaseUrl: "http://localhost:7002/api/auth",
    });
  });

  it("fails when required injected client config is missing", () => {
    expect(() => getServerConfig({ APP_ENV: "development" })).toThrow();
  });
});
