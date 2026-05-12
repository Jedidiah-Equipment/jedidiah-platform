import { describe, expect, it } from "vitest";

import { getDatabaseUrl } from "./env.js";

describe("database env", () => {
  it("uses DATABASE_URL outside tests", () => {
    expect(
      getDatabaseUrl({
        NODE_ENV: "development",
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/jedidiah",
        TEST_DATABASE_URL: "postgres://postgres:postgres@localhost:5432/jedidiah_template",
      }),
    ).toBe("postgres://postgres:postgres@localhost:5432/jedidiah");
  });

  it("uses TEST_DATABASE_URL in tests", () => {
    expect(
      getDatabaseUrl({
        NODE_ENV: "test",
        DATABASE_URL: "postgres://postgres:postgres@localhost:5432/jedidiah",
        TEST_DATABASE_URL: "postgres://postgres:postgres@localhost:5432/jedidiah_template",
      }),
    ).toBe("postgres://postgres:postgres@localhost:5432/jedidiah_template");
  });
});
