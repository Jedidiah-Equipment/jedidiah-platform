import { describe, expect, it } from "vitest";

import { parseClientConfig } from "./app-config.js";

describe("client config", () => {
  it("parses local defaults", () => {
    expect(
      parseClientConfig({
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
});
