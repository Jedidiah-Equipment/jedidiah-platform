ALTER TABLE "product_assemblies" ADD COLUMN "display_order" integer;--> statement-breakpoint
UPDATE "product_assemblies" AS pa
SET "display_order" = ordered.rn
FROM (
  SELECT
    "id",
    row_number() OVER (PARTITION BY "product_id", "kind" ORDER BY "name" ASC) - 1 AS rn
  FROM "product_assemblies"
) AS ordered
WHERE pa."id" = ordered."id";--> statement-breakpoint
ALTER TABLE "product_assemblies" ALTER COLUMN "display_order" SET NOT NULL;