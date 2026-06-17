ALTER TABLE "products" ADD COLUMN "range_id" uuid;--> statement-breakpoint
INSERT INTO "product_ranges" ("id", "name", "image_data_url")
VALUES ('00000000-0000-4000-8000-000000000488', 'Crosshaul', NULL);--> statement-breakpoint
UPDATE "products"
SET "range_id" = '00000000-0000-4000-8000-000000000488'
WHERE "range_id" IS NULL;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "range_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_range_id_product_ranges_id_fk" FOREIGN KEY ("range_id") REFERENCES "public"."product_ranges"("id") ON DELETE restrict ON UPDATE no action;
