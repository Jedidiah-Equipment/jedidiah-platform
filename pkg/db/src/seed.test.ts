import { describe, expect, it } from "vitest";

import { createSeedProducts } from "./seed.js";

describe("createSeedProducts", () => {
  it("creates the requested number of deterministic seed products", () => {
    expect(createSeedProducts(3)).toEqual([
      {
        id: "00000000-0000-4000-8000-000000000001",
        basePrice: 143_750,
        currencyCode: "ZAR",
        description: "Atlas wheel loader configured for local demo inventory.",
        modelCode: "JED-WL-001",
        name: "Atlas Wheel Loader 001",
      },
      {
        id: "00000000-0000-4000-8000-000000000002",
        basePrice: 162_500,
        currencyCode: "ZAR",
        description: "Summit excavator configured for local demo inventory.",
        modelCode: "JED-E-002",
        name: "Summit Excavator 002",
      },
      {
        id: "00000000-0000-4000-8000-000000000003",
        basePrice: 181_250,
        currencyCode: "ZAR",
        description: "Vertex skid steer configured for local demo inventory.",
        modelCode: "JED-SS-003",
        name: "Vertex Skid Steer 003",
      },
    ]);
  });

  it("keeps generated product identities unique", () => {
    const seedProducts = createSeedProducts(25);

    expect(new Set(seedProducts.map((product) => product.id)).size).toBe(seedProducts.length);
    expect(new Set(seedProducts.map((product) => product.modelCode)).size).toBe(
      seedProducts.length,
    );
    expect(new Set(seedProducts.map((product) => product.name)).size).toBe(seedProducts.length);
  });
});
