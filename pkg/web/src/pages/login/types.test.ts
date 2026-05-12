import { describe, expect, it } from "vitest";

import { LoginForm } from "./types.js";

describe("LoginForm", () => {
  it("accepts valid login values", () => {
    expect(
      LoginForm.parse({
        email: "operator@example.com",
        password: "password123",
      }),
    ).toEqual({
      email: "operator@example.com",
      password: "password123",
    });
  });

  it("rejects empty or invalid values", () => {
    expect(() => LoginForm.parse({ email: "", password: "" })).toThrow();
    expect(() => LoginForm.parse({ email: "not-email", password: "password123" })).toThrow();
    expect(() => LoginForm.parse({ email: "a@example.com", password: "short" })).toThrow();
  });
});
