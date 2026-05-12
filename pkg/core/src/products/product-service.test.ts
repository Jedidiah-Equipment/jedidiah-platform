import { describe, expect, it } from "vitest";

import { mapProduct } from "./product-service.js";

describe("mapProduct", () => {
  it("maps product rows to product DTOs", () => {
    expect(
      mapProduct({
        id: "00000000-0000-4000-8000-000000000001",
        name: "Wheel Loader",
      }),
    ).toEqual({
      id: "00000000-0000-4000-8000-000000000001",
      name: "Wheel Loader",
    });
  });
});
