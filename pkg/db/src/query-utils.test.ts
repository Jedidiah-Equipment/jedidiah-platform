import { describe, expect, it } from "vitest";

import { getPaginationOffset, isUniqueViolation } from "./query-utils.js";

describe("getPaginationOffset", () => {
  it("calculates a zero-based offset from one-based pagination input", () => {
    expect(getPaginationOffset({ page: 1, pageSize: 10 })).toBe(0);
    expect(getPaginationOffset({ page: 3, pageSize: 25 })).toBe(50);
  });
});

describe("isUniqueViolation", () => {
  it("detects Postgres unique violation errors", () => {
    expect(isUniqueViolation({ code: "23505" })).toBe(true);
  });

  it("detects nested Postgres unique violation causes", () => {
    expect(isUniqueViolation({ cause: { code: "23505" } })).toBe(true);
  });

  it("rejects non-unique violation errors", () => {
    expect(isUniqueViolation(null)).toBe(false);
    expect(isUniqueViolation({ code: "23503" })).toBe(false);
    expect(isUniqueViolation({ cause: { code: "23503" } })).toBe(false);
  });
});
