ALTER TABLE "parts" ADD COLUMN "minimum_stock" integer;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "standard_purchase_length_mm" integer;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "stock_tracking_mode" text DEFAULT 'perpetual' NOT NULL;--> statement-breakpoint
ALTER TABLE "parts" ADD COLUMN "storage_location" text;--> statement-breakpoint
UPDATE "parts" SET "unit_of_measure" = 'piece' WHERE "unit_of_measure" = 'quantity';--> statement-breakpoint
UPDATE "parts"
SET "category" = 'Pipe'
WHERE "code" = 'SEMP-0001';--> statement-breakpoint
UPDATE "parts"
SET "standard_purchase_length_mm" = CASE "code"
  WHEN 'SEMP-0001' THEN 6000
  WHEN 'LTE-0027' THEN 1000
  WHEN 'LTE-0028' THEN 1000
  WHEN 'CONS-0036' THEN 1000
END
WHERE "code" IN ('SEMP-0001', 'LTE-0027', 'LTE-0028', 'CONS-0036');--> statement-breakpoint
CREATE INDEX "parts_storage_location_idx" ON "parts" USING btree ("storage_location");--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_minimum_stock_nonnegative" CHECK ("parts"."minimum_stock" IS NULL OR "parts"."minimum_stock" >= 0);--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_standard_purchase_length_mm_positive" CHECK ("parts"."standard_purchase_length_mm" IS NULL OR "parts"."standard_purchase_length_mm" > 0);--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_stock_tracking_mode_check" CHECK ("parts"."stock_tracking_mode" IN ('perpetual', 'periodic'));--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_storage_location_nonempty" CHECK ("parts"."storage_location" IS NULL OR length(trim("parts"."storage_location")) > 0);
