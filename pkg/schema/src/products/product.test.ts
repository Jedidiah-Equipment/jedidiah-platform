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
      columnFilters: {},
      page: 1,
      pageSize: 10,
      search: "",
      sortBy: "name",
      sortDirection: "asc",
    });
  });

  it("coerces list paging from URL-like values", () => {
    expect(
      ProductListInput.parse({
        page: "2",
        pageSize: "25",
        search: "  loader  ",
        columnFilters: {
          id: "  abc  ",
          name: "  compact  ",
        },
        sortBy: "id",
        sortDirection: "desc",
      }),
    ).toEqual({
      columnFilters: {
        id: "abc",
        name: "compact",
      },
      page: 2,
      pageSize: 25,
      search: "loader",
      sortBy: "id",
      sortDirection: "desc",
    });
  });
});
