import { describe, expect, it } from "vitest";

import {
  ProductCreateInputSchema,
  ProductListInputSchema,
  ProductNameSchema,
  ProductUpdateInputSchema,
} from "./product.js";

describe("product schemas", () => {
  it("trims product names", () => {
    expect(ProductNameSchema.parse("  Excavator  ")).toBe("Excavator");
  });

  it("rejects blank product names", () => {
    expect(() => ProductCreateInputSchema.parse({ name: "   " })).toThrow();
  });

  it("validates update IDs as UUIDs", () => {
    expect(() => ProductUpdateInputSchema.parse({ id: "not-a-uuid", name: "Bucket" })).toThrow();
  });

  it("defaults list paging and sorting", () => {
    expect(ProductListInputSchema.parse(undefined)).toEqual({
      page: 1,
      pageSize: 10,
      sortBy: "name",
      sortDirection: "asc",
    });
  });

  it("coerces list paging from URL-like values", () => {
    expect(
      ProductListInputSchema.parse({
        page: "2",
        pageSize: "25",
        sortBy: "id",
        sortDirection: "desc",
      }),
    ).toEqual({
      page: 2,
      pageSize: 25,
      sortBy: "id",
      sortDirection: "desc",
    });
  });
});
