DROP INDEX "product_ranges_name_ci_unique";--> statement-breakpoint
DROP INDEX "products_model_code_unique";--> statement-breakpoint
DROP INDEX "products_name_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "product_ranges_name_ci_unique" ON "product_ranges" USING btree (lower("name")) WHERE "product_ranges"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "products_model_code_unique" ON "products" USING btree ("model_code") WHERE "products"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "products_name_unique" ON "products" USING btree ("name") WHERE "products"."deleted_at" is null;