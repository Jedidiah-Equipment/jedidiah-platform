import { createUserAccessSummary } from "@pkg/domain";
import type { UserAccessSummary } from "@pkg/schema";
import { describe, expect, test } from "vitest";

import type { AiContext } from "@/routes/ai/ai-context.js";
import {
  aiTools,
  dispatchToolCall,
  getAuthorizedToolNames,
  getAuthorizedTools,
} from "@/routes/ai/ai-tools.js";
import { mockSession } from "@/test/test-utils.js";

function createAiContext(access: UserAccessSummary | null = null): AiContext {
  return {
    access,
    db: {} as AiContext["db"],
    session: mockSession(access?.role ?? "product-viewer"),
  };
}

function createAccessWithNoProductRead(): UserAccessSummary {
  return {
    permissions: [],
    role: null,
    userId: "test-user-id",
  };
}

describe("aiTools", () => {
  test("declares a required permission for each tool", () => {
    expect(aiTools.listProducts.requiredPermission).toBe("product:read");
  });

  test("returns tools permitted by the user's access summary", () => {
    const tools = getAuthorizedTools(
      createUserAccessSummary({
        role: "product-viewer",
        userId: "test-user-id",
      }),
    );

    expect(getAuthorizedToolNames(tools)).toEqual(["listProducts"]);
  });

  test("hides tools when the user lacks the required permission", () => {
    expect(getAuthorizedTools(createAccessWithNoProductRead())).toEqual({});
    expect(getAuthorizedTools(null)).toEqual({});
  });

  test("dispatches only against the supplied tool map", async () => {
    await expect(
      dispatchToolCall({}, "listProducts", {}, createAiContext(createAccessWithNoProductRead())),
    ).resolves.toEqual({
      error: "Unknown tool: listProducts",
      name: "listProducts",
      ok: false,
    });
  });
});
