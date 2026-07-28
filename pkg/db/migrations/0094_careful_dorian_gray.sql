CREATE UNIQUE INDEX "product_unit_id_product_id_unique" ON "product_unit" USING btree ("id","product_id");--> statement-breakpoint
ALTER TABLE "quote" DROP CONSTRAINT "quote_product_unit_id_product_unit_id_fk";--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_product_unit_product_fk" FOREIGN KEY ("product_unit_id","product_id") REFERENCES "public"."product_unit"("id","product_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
