import { hasPermission } from "@pkg/schema";
import { describe, expect, it } from "vitest";

import { createUserAccessSummary, getRolePermissions, normalizeAppRoles } from "./authorization.js";

describe("normalizeAppRoles", () => {
  it("keeps supported roles", () => {
    expect(normalizeAppRoles("admin")).toEqual(["admin"]);
    expect(normalizeAppRoles("product-viewer, product-editor")).toEqual([
      "product-viewer",
      "product-editor",
    ]);
  });

  it("normalizes unknown and missing roles to no access", () => {
    expect(normalizeAppRoles(undefined)).toEqual([]);
    expect(normalizeAppRoles("manager")).toEqual([]);
  });
});

describe("getRolePermissions", () => {
  it("grants all v1 permissions to admins", () => {
    expect(getRolePermissions(["admin"])).toEqual([
      "audit:read",
      "product:create",
      "product:read",
      "product:update",
      "user:edit",
      "user:list",
    ]);
  });

  it("grants product write permissions to product editors", () => {
    expect(getRolePermissions(["product-editor"])).toEqual([
      "product:create",
      "product:read",
      "product:update",
    ]);
  });

  it("grants read-only product access to product viewers", () => {
    expect(getRolePermissions(["product-viewer"])).toEqual(["product:read"]);
  });
});

describe("createUserAccessSummary", () => {
  it("builds a serialized access summary", () => {
    expect(createUserAccessSummary({ role: "product-viewer", userId: "user_123" })).toEqual({
      permissions: ["product:read"],
      role: "product-viewer",
      userId: "user_123",
    });
  });

  it("keeps a single public role while allowing internal multi-role permission calculation", () => {
    expect(
      createUserAccessSummary({
        role: "product-viewer, admin",
        userId: "user_123",
      }),
    ).toEqual({
      permissions: [
        "audit:read",
        "product:create",
        "product:read",
        "product:update",
        "user:edit",
        "user:list",
      ],
      role: "admin",
      userId: "user_123",
    });
  });

  it("uses null for missing or unknown public roles", () => {
    expect(createUserAccessSummary({ role: "manager", userId: "user_123" })).toEqual({
      permissions: [],
      role: null,
      userId: "user_123",
    });
  });
});

describe("hasPermission", () => {
  it("checks access summaries", () => {
    const access = createUserAccessSummary({ role: "product-editor", userId: "user_123" });

    expect(hasPermission(access, "product:update")).toBe(true);
    expect(hasPermission(access, "user:list")).toBe(false);
  });
});
