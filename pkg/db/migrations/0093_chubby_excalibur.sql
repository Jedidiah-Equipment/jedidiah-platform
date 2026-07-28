ALTER TABLE "quote" DROP CONSTRAINT "quote_kind_shape";--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "product_unit_id" uuid;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_product_unit_id_product_unit_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_unit"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "quote_product_unit_live_idx" ON "quote" USING btree ("product_unit_id","status");--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_kind_shape" CHECK ((
        "quote"."kind" = 'product' and "quote"."product_id" is not null and "quote"."work_title" is null
      ) or (
        "quote"."kind" = 'custom' and "quote"."product_id" is null and "quote"."product_unit_id" is null and "quote"."work_title" is not null and length(trim("quote"."work_title")) > 0 and "quote"."quoted_base_price" = 0
      ));