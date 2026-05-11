import { describe, expect, it } from "vitest";

import { AuthIdSchema } from "./auth-id.js";

describe("AuthIdSchema", () => {
  it("accepts non-empty Better Auth identifiers", () => {
    expect(AuthIdSchema.parse("user_123")).toBe("user_123");
  });

  it("rejects blank identifiers", () => {
    expect(() => AuthIdSchema.parse("   ")).toThrow();
  });
});
