import { describe, expect, it } from "vitest";

import { AppRole, UserSetRoleInput } from "./authorization.js";

describe("AppRole", () => {
  it("accepts supported app roles", () => {
    expect(AppRole.parse("admin")).toBe("admin");
    expect(AppRole.parse("product-editor")).toBe("product-editor");
    expect(AppRole.parse("product-viewer")).toBe("product-viewer");
  });

  it("rejects unknown roles", () => {
    expect(() => AppRole.parse("manager")).toThrow();
  });
});

describe("UserSetRoleInput", () => {
  it("requires a supported role and user id", () => {
    expect(
      UserSetRoleInput.parse({
        role: "product-editor",
        userId: "user_123",
      }),
    ).toEqual({
      role: "product-editor",
      userId: "user_123",
    });
  });
});
