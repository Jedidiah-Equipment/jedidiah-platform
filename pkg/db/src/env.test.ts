import { describe, expect, it } from "vitest";

import { getDatabaseUrl } from "./env.js";

describe("database env", () => {
  it("uses DATABASE_URL outside tests", () => {
    expect(
      getDatabaseUrl({
        NODE_ENV: "development",
        DATABASE_URL: "postgres://app:app@localhost:5432/app_dev",
        TEST_DATABASE_URL: "postgres://app:app@localhost:5432/app_test",
      }),
    ).toBe("postgres://app:app@localhost:5432/app_dev");
  });

  it("uses TEST_DATABASE_URL in tests", () => {
    expect(
      getDatabaseUrl({
        NODE_ENV: "test",
        DATABASE_URL: "postgres://app:app@localhost:5432/app_dev",
        TEST_DATABASE_URL: "postgres://app:app@localhost:5432/app_test",
      }),
    ).toBe("postgres://app:app@localhost:5432/app_test");
  });
});
