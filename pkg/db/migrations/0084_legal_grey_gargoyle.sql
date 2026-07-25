-- Stored translations are locale-keyed objects. Remove only the retired field so every other
-- translation envelope survives the Product schema change.
UPDATE "products"
SET "translations" = COALESCE(
  (
    SELECT jsonb_object_agg("locale", "fields" - 'technicalDetails')
    FROM jsonb_each("products"."translations") AS "translation"("locale", "fields")
  ),
  '{}'::jsonb
)
WHERE EXISTS (
  SELECT 1
  FROM jsonb_each("products"."translations") AS "translation"("locale", "fields")
  WHERE "fields" ? 'technicalDetails'
);
--> statement-breakpoint
-- Product audit events remain as immutable event metadata, but the retired collection values must
-- not remain visible or recoverable through their generic JSON change maps.
UPDATE "audit_events"
SET "changes" = COALESCE(
  (
    SELECT jsonb_object_agg("field", "change")
    FROM jsonb_each("audit_events"."changes") AS "entry"("field", "change")
    WHERE "field" NOT LIKE 'technicalDetail:%'
  ),
  '{}'::jsonb
)
WHERE "entity_type" = 'product'
  AND "changes" IS NOT NULL
  AND EXISTS (
    SELECT 1
    FROM jsonb_object_keys("audit_events"."changes") AS "field"
    WHERE "field" LIKE 'technicalDetail:%'
  );
--> statement-breakpoint
ALTER TABLE "products" DROP COLUMN "technical_details";
