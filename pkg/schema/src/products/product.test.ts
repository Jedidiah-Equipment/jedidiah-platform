import { describe, expect, it } from "vitest";

import { ProductCreateInput } from "./product.js";

describe("ProductCreateInput", () => {
  it("normalizes product catalog fields", () => {
    expect(
      ProductCreateInput.parse({
        basePrice: "1234.56",
        description: "  Earthmoving equipment  ",
        modelCode: "  WL-100  ",
        name: "  Wheel Loader  ",
      }),
    ).toEqual({
      basePrice: 1234.56,
      currencyCode: "ZAR",
      description: "Earthmoving equipment",
      modelCode: "WL-100",
      name: "Wheel Loader",
    });
  });

  it("treats an empty description as null", () => {
    expect(
      ProductCreateInput.parse({
        basePrice: 0,
        description: "  ",
        modelCode: "WL-100",
        name: "Wheel Loader",
      }).description,
    ).toBeNull();
  });

  it("requires a model code and nonnegative price", () => {
    expect(() =>
      ProductCreateInput.parse({
        basePrice: -1,
        modelCode: "  ",
        name: "Wheel Loader",
      }),
    ).toThrow();
  });

  it("rejects an empty base price", () => {
    expect(() =>
      ProductCreateInput.parse({
        basePrice: "",
        modelCode: "WL-100",
        name: "Wheel Loader",
      }),
    ).toThrow();
  });
});
