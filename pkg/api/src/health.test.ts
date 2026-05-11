import { afterAll, beforeEach, describe, expect, it } from "vitest";

import { closeIntegrationState, getTestApp, resetIntegrationState } from "./test/integration.js";

beforeEach(async () => {
  await resetIntegrationState();
});

afterAll(async () => {
  await closeIntegrationState();
});

describe("health routes", () => {
  it("returns health status", async () => {
    const response = await (await getTestApp()).inject({
      method: "GET",
      url: "/health",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ ok: true });
  });

  it("returns API version info", async () => {
    const response = await (await getTestApp()).inject({
      method: "GET",
      url: "/api/version",
    });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      name: "@pkg/api",
      version: "0.0.0",
    });
  });
});
