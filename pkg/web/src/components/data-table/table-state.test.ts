import type { SortingState } from "@tanstack/react-table";
import { describe, expect, it } from "vitest";

import {
  constrainPagination,
  constrainSorting,
  getPageCount,
  getPrimarySort,
} from "./table-state.js";

const sortOptions = {
  allowedSortIds: ["name", "email", "role"],
  defaultSort: {
    id: "email",
  },
} as const;

describe("data table state helpers", () => {
  it("returns at least one page", () => {
    expect(getPageCount(0, 10)).toBe(1);
    expect(getPageCount(1, 10)).toBe(1);
    expect(getPageCount(11, 10)).toBe(2);
  });

  it("clamps pagination to the available page count", () => {
    expect(constrainPagination({ pageIndex: 4, pageSize: 10 }, 2)).toEqual({
      pageIndex: 1,
      pageSize: 10,
    });
    expect(constrainPagination({ pageIndex: 0, pageSize: 25 }, 0)).toEqual({
      pageIndex: 0,
      pageSize: 25,
    });
  });

  it("preserves allowed primary sort ids and direction", () => {
    const sorting: SortingState = [{ id: "role", desc: true }];

    expect(getPrimarySort(sorting, sortOptions)).toEqual({
      id: "role",
      desc: true,
    });
    expect(constrainSorting(sorting, sortOptions)).toEqual([{ id: "role", desc: true }]);
  });

  it("falls back to the default sort for missing or disallowed ids", () => {
    expect(constrainSorting([], sortOptions)).toEqual([{ id: "email", desc: false }]);
    expect(constrainSorting([{ id: "createdAt", desc: true }], sortOptions)).toEqual([
      { id: "email", desc: false },
    ]);
  });
});
