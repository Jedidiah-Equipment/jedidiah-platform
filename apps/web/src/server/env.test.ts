import { describe, expect, it } from "vitest";

import { getInjectedClientConfig, getServerConfig } from "./env.js";

const validEnv = {
  PORT: "5173",
  PUBLIC_APP_ENV: "development",
  PUBLIC_APP_BASE_URL: "http://localhost:5173",
  PUBLIC_API_BASE_URL: "http://localhost:3000",
  PUBLIC_AUTH_BASE_URL: "http://localhost:3000/api/auth",
};

describe("web server config", () => {
  it("parses server config separately from injected client config", () => {
    expect(getServerConfig(validEnv)).toEqual({
      port: 5173,
      clientConfig: {
        appEnv: "development",
        appBaseUrl: "http://localhost:5173",
        apiBaseUrl: "http://localhost:3000",
        authBaseUrl: "http://localhost:3000/api/auth",
      },
    });
  });

  it("returns only the injected client config", () => {
    expect(getInjectedClientConfig(validEnv)).toEqual({
      appEnv: "development",
      appBaseUrl: "http://localhost:5173",
      apiBaseUrl: "http://localhost:3000",
      authBaseUrl: "http://localhost:3000/api/auth",
    });
  });

  it("fails when required injected client config is missing", () => {
    expect(() => getServerConfig({ PUBLIC_APP_ENV: "development" })).toThrow();
  });
});
