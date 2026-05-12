import { describe, expect, it } from "vitest";

import { AuthId } from "./auth-id.js";

describe("AuthId", () => {
  it("accepts non-empty Better Auth identifiers", () => {
    expect(AuthId.parse("user_123")).toBe("user_123");
  });

  it("rejects blank identifiers", () => {
    expect(() => AuthId.parse("   ")).toThrow();
  });
});
