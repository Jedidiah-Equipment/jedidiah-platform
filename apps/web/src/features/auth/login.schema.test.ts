import { describe, expect, it } from "vitest";

import { LoginFormSchema } from "./login.schema.js";

describe("LoginFormSchema", () => {
  it("accepts valid login values", () => {
    expect(
      LoginFormSchema.parse({
        email: "operator@example.com",
        password: "password123",
      }),
    ).toEqual({
      email: "operator@example.com",
      password: "password123",
    });
  });

  it("rejects empty or invalid values", () => {
    expect(() => LoginFormSchema.parse({ email: "", password: "" })).toThrow();
    expect(() => LoginFormSchema.parse({ email: "not-email", password: "password123" })).toThrow();
    expect(() => LoginFormSchema.parse({ email: "a@example.com", password: "short" })).toThrow();
  });
});
