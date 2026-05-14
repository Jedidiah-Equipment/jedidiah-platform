import { describe, expect, it } from "vitest";

import { createSeedProductAuditTimeline, createSeedProducts } from "./seed.js";

const millisecondsPerDay = 24 * 60 * 60 * 1000;

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

describe("createSeedProductAuditTimeline", () => {
  it("creates historical product audits and aligns product timestamps to the latest audit", () => {
    const now = new Date("2026-05-14T12:00:00.000Z");
    const seedProducts = createSeedProducts(6);
    const timeline = createSeedProductAuditTimeline({
      actorUserIds: ["seed-product-editor-user"],
      now,
      products: seedProducts,
    });

    expect(timeline.auditEvents).toEqual(
      [...timeline.auditEvents].sort(
        (left, right) => left.occurredAt.getTime() - right.occurredAt.getTime(),
      ),
    );

    for (const [productIndex, product] of timeline.products.entries()) {
      const initialProduct = seedProducts[productIndex];
      expect(initialProduct).toBeDefined();
      expect(product.name).toBe(initialProduct?.name);
      expect(product.modelCode).toBe(initialProduct?.modelCode);

      const productEvents = timeline.auditEvents.filter((event) => event.entityId === product.id);
      const createdEvents = productEvents.filter((event) => event.action === "created");
      const updateEvents = productEvents.filter((event) => event.action === "updated");

      expect(createdEvents).toHaveLength(1);
      expect(createdEvents[0]?.occurredAt.getTime()).toBe(product.createdAt.getTime());

      const ageDays = getUtcDateAgeDays(product.createdAt, now);
      expect(ageDays).toBeGreaterThanOrEqual(7);
      expect(ageDays).toBeLessThanOrEqual(28);
      expect(groupEventsByUtcDate(updateEvents).size).toBe(ageDays);

      for (const event of productEvents) {
        expect(event.occurredAt.getTime()).toBeGreaterThanOrEqual(product.createdAt.getTime());
        expect(event.occurredAt.getTime()).toBeLessThanOrEqual(now.getTime());
      }

      for (const eventsForDay of groupEventsByUtcDate(updateEvents).values()) {
        expect(eventsForDay.length).toBeGreaterThanOrEqual(1);
        expect(eventsForDay.length).toBeLessThanOrEqual(3);
      }

      const latestOccurredAt = Math.max(
        ...productEvents.map((event) => event.occurredAt.getTime()),
      );
      expect(product.updatedAt.getTime()).toBe(latestOccurredAt);
    }
  });

  it("records update changes that match the generated product state", () => {
    const now = new Date("2026-05-14T12:00:00.000Z");
    const seedProducts = createSeedProducts(3);
    const timeline = createSeedProductAuditTimeline({
      actorUserIds: ["seed-product-editor-user"],
      now,
      products: seedProducts,
    });

    for (const [productIndex, product] of timeline.products.entries()) {
      const initialProduct = seedProducts[productIndex];
      expect(initialProduct).toBeDefined();

      let currentBasePrice = initialProduct?.basePrice;
      let currentDescription = initialProduct?.description;
      const updateEvents = timeline.auditEvents.filter(
        (event) => event.entityId === product.id && event.action === "updated",
      );

      for (const event of updateEvents) {
        expect(event.summary).toBe(`Updated product "${product.name}"`);
        expect(event.changes?.basePrice?.from).toBe(currentBasePrice);
        expect(typeof event.changes?.basePrice?.to).toBe("number");

        currentBasePrice = event.changes?.basePrice?.to as number;

        if (event.changes?.description) {
          expect(event.changes.description.from).toBe(currentDescription);
          expect(typeof event.changes.description.to).toBe("string");
          currentDescription = event.changes.description.to as string;
        }
      }

      expect(product.basePrice).toBe(currentBasePrice);
      expect(product.description).toBe(currentDescription);
    }
  });
});

function groupEventsByUtcDate<TEvent extends { occurredAt: Date }>(
  events: readonly TEvent[],
): Map<string, TEvent[]> {
  const eventsByDate = new Map<string, TEvent[]>();

  for (const event of events) {
    const dateKey = event.occurredAt.toISOString().slice(0, 10);
    const eventsForDate = eventsByDate.get(dateKey) ?? [];
    eventsForDate.push(event);
    eventsByDate.set(dateKey, eventsForDate);
  }

  return eventsByDate;
}

function getUtcDateAgeDays(createdAt: Date, now: Date): number {
  const createdDate = Date.UTC(
    createdAt.getUTCFullYear(),
    createdAt.getUTCMonth(),
    createdAt.getUTCDate(),
  );
  const nowDate = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());

  return Math.round((nowDate - createdDate) / millisecondsPerDay);
}
