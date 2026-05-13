import { describe, expect, it } from "vitest";

import { AppRole, hasPermission, UserCreateInput, UserUpdateInput } from "./authorization.js";

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

describe("UserCreateInput", () => {
  it("requires user details and a password", () => {
    expect(
      UserCreateInput.parse({
        email: "viewer@example.com",
        emailVerified: true,
        name: "Viewer User",
        password: "12345678",
        role: "product-editor",
      }),
    ).toEqual({
      email: "viewer@example.com",
      emailVerified: true,
      name: "Viewer User",
      password: "12345678",
      role: "product-editor",
    });
  });

  it("rejects short passwords", () => {
    expect(() =>
      UserCreateInput.parse({
        email: "viewer@example.com",
        emailVerified: true,
        name: "Viewer User",
        password: "1234567",
        role: "product-editor",
      }),
    ).toThrow();
  });
});

describe("UserUpdateInput", () => {
  it("allows user details without a password", () => {
    expect(
      UserUpdateInput.parse({
        email: "viewer@example.com",
        emailVerified: false,
        name: "Viewer User",
        role: "product-editor",
        userId: "user_123",
      }),
    ).toEqual({
      email: "viewer@example.com",
      emailVerified: false,
      name: "Viewer User",
      role: "product-editor",
      userId: "user_123",
    });
  });

  it("allows an optional password reset", () => {
    expect(
      UserUpdateInput.parse({
        email: "viewer@example.com",
        emailVerified: true,
        name: "Viewer User",
        password: "12345678",
        role: "product-editor",
        userId: "user_123",
      }).password,
    ).toBe("12345678");
  });
});

describe("hasPermission", () => {
  it("checks access summaries", () => {
    expect(
      hasPermission(
        {
          permissions: ["product:read"],
        },
        "product:read",
      ),
    ).toBe(true);
    expect(
      hasPermission(
        {
          permissions: ["product:read"],
        },
        "product:update",
      ),
    ).toBe(false);
  });

  it("treats missing access as denied", () => {
    expect(hasPermission(null, "product:read")).toBe(false);
  });
});
