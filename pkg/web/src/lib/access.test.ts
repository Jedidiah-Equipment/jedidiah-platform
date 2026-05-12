import { describe, expect, it } from "vitest";

import { canAccess } from "./access.js";

describe("canAccess", () => {
  it("checks access summaries", () => {
    expect(
      canAccess(
        {
          permissions: ["product:read"],
        },
        "product:read",
      ),
    ).toBe(true);
    expect(
      canAccess(
        {
          permissions: ["product:read"],
        },
        "product:update",
      ),
    ).toBe(false);
  });

  it("treats missing access as denied", () => {
    expect(canAccess(null, "product:read")).toBe(false);
  });
});
