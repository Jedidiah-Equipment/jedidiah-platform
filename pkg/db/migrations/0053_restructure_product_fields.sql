ALTER TABLE "products" RENAME COLUMN "brochure_subtitle" TO "category";--> statement-breakpoint
ALTER TABLE "products" RENAME COLUMN "brochure_key_features" TO "key_features";--> statement-breakpoint
ALTER TABLE "products" RENAME COLUMN "brochure_images" TO "images";--> statement-breakpoint
-- Remap the jsonb image slot keys in place: hero -> primary, secondary -> banner; technicalDrawing is
-- left untouched. Guarded with `?` so rows missing a slot are not rewritten and absent keys are skipped.
UPDATE "products"
SET "images" = (
  ("images" - 'hero' - 'secondary')
  || (CASE WHEN "images" ? 'hero' THEN jsonb_build_object('primary', "images" -> 'hero') ELSE '{}'::jsonb END)
  || (CASE WHEN "images" ? 'secondary' THEN jsonb_build_object('banner', "images" -> 'secondary') ELSE '{}'::jsonb END)
)
WHERE "images" ? 'hero' OR "images" ? 'secondary';
