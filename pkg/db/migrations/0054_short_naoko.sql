ALTER TABLE "product_ranges" ADD COLUMN "logo" jsonb;--> statement-breakpoint
ALTER TABLE "product_ranges" ADD COLUMN "display_order" integer;--> statement-breakpoint
-- Backfill display_order for existing rows, preserving the prior name-based ordering.
UPDATE "product_ranges" AS pr
SET "display_order" = ranked.rn
FROM (
  SELECT "id", (row_number() OVER (ORDER BY lower("name"), "id") - 1) AS rn
  FROM "product_ranges"
) AS ranked
WHERE pr."id" = ranked."id";--> statement-breakpoint
ALTER TABLE "product_ranges" ALTER COLUMN "display_order" SET NOT NULL;
