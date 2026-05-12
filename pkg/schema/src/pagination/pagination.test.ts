import { describe, expect, it } from "vitest";
import { z } from "zod";

import { createPagedQueryResult, PagedQueryInput } from "./pagination.js";

describe("pagination schemas", () => {
  it("defaults paged query inputs", () => {
    expect(PagedQueryInput.parse({})).toEqual({
      page: 1,
      pageSize: 10,
    });
  });

  it("coerces paged query inputs from URL-like values", () => {
    expect(
      PagedQueryInput.parse({
        page: "2",
        pageSize: "25",
      }),
    ).toEqual({
      page: 2,
      pageSize: 25,
    });
  });

  it("validates paged query results", () => {
    const Result = createPagedQueryResult(
      z.object({
        id: z.string(),
      }),
    );

    expect(
      Result.parse({
        items: [{ id: "item-1" }],
        total: 1,
        page: 1,
        pageSize: 10,
        pageCount: 1,
      }),
    ).toEqual({
      items: [{ id: "item-1" }],
      total: 1,
      page: 1,
      pageSize: 10,
      pageCount: 1,
    });
  });
});
