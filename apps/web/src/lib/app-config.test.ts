import { describe, expect, it } from "vitest";

import { parsePublicAppConfig } from "./app-config.js";
import { getPublicEnvConfig } from "./env.js";

describe("public app config", () => {
  it("parses local defaults", () => {
    expect(
      parsePublicAppConfig({
        appEnv: "development",
        appBaseUrl: "http://localhost:5173",
        apiBaseUrl: "http://localhost:3000",
        authBaseUrl: "http://localhost:3000/api/auth",
      }),
    ).toEqual({
      appEnv: "development",
      appBaseUrl: "http://localhost:5173",
      apiBaseUrl: "http://localhost:3000",
      authBaseUrl: "http://localhost:3000/api/auth",
    });
  });

  it("fails when required public config is missing", () => {
    expect(() => getPublicEnvConfig({ PUBLIC_APP_ENV: "development" })).toThrow();
  });
});
