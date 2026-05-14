DROP INDEX "product_options_product_id_code_unique";--> statement-breakpoint
ALTER TABLE "product_options" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "product_options_active_product_id_code_unique" ON "product_options" USING btree ("product_id","code") WHERE "product_options"."deleted_at" IS NULL;