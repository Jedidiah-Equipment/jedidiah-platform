import { describe, expect, it } from "vitest";

import {
  ProductCreateInput,
  ProductListInput,
  ProductName,
  ProductUpdateInput,
} from "./product.js";

describe("product schemas", () => {
  it("trims product names", () => {
    expect(ProductName.parse("  Excavator  ")).toBe("Excavator");
  });

  it("rejects blank product names", () => {
    expect(() => ProductCreateInput.parse({ name: "   " })).toThrow();
  });

  it("validates update IDs as UUIDs", () => {
    expect(() => ProductUpdateInput.parse({ id: "not-a-uuid", name: "Bucket" })).toThrow();
  });

  it("defaults list paging and sorting", () => {
    expect(ProductListInput.parse(undefined)).toEqual({
      page: 1,
      pageSize: 10,
      sortBy: "name",
      sortDirection: "asc",
    });
  });

  it("coerces list paging from URL-like values", () => {
    expect(
      ProductListInput.parse({
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
