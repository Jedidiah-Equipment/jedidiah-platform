import { describe, expect, it } from "vitest";

import { invariant } from "./invariant.js";

describe("invariant", () => {
  it("does not throw for truthy conditions", () => {
    expect(() => invariant(true, "should not throw")).not.toThrow();
  });

  it("throws the provided message for falsy conditions", () => {
    expect(() => invariant(false, "expected failure")).toThrow("expected failure");
  });
});
