ALTER TABLE "equipment"."stock_movement" DROP CONSTRAINT "stock_movement_shape";--> statement-breakpoint
ALTER TABLE "equipment"."stock_movement" ADD COLUMN "quote_id" uuid;--> statement-breakpoint
ALTER TABLE "equipment"."stock_movement" ADD CONSTRAINT "stock_movement_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "equipment"."quote"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movement_quote_part_created_idx" ON "equipment"."stock_movement" USING btree ("quote_id","part_id","created_at","id");--> statement-breakpoint
ALTER TABLE "equipment"."stock_movement" ADD CONSTRAINT "stock_movement_shape" CHECK ((
        "equipment"."stock_movement"."movement_type" = 'adjustment'
        AND "equipment"."stock_movement"."job_id" IS NULL
        AND "equipment"."stock_movement"."quote_id" IS NULL
        AND "equipment"."stock_movement"."recipient_user_id" IS NULL
        AND "equipment"."stock_movement"."source_checkout_id" IS NULL
        AND "equipment"."stock_movement"."purchase_order_id" IS NULL
        AND "equipment"."stock_movement"."build_id" IS NULL
        AND "equipment"."stock_movement"."reason" IN ('opening-balance', 'stock-count', 'damage', 'scrap', 'correction')
        AND ("equipment"."stock_movement"."stocktake_session_id" IS NULL OR "equipment"."stock_movement"."reason" = 'stock-count')
        AND (
          "equipment"."stock_movement"."reason" = 'opening-balance'
          OR "equipment"."stock_movement"."stocktake_session_id" IS NOT NULL
          OR "equipment"."stock_movement"."note" IS NOT NULL
        )
        AND ("equipment"."stock_movement"."unit_cost" IS NULL OR "equipment"."stock_movement"."reason" = 'opening-balance')
      ) OR (
        "equipment"."stock_movement"."movement_type" = 'revaluation'
        AND "equipment"."stock_movement"."job_id" IS NULL
        AND "equipment"."stock_movement"."quote_id" IS NULL
        AND "equipment"."stock_movement"."recipient_user_id" IS NULL
        AND "equipment"."stock_movement"."source_checkout_id" IS NULL
        AND "equipment"."stock_movement"."purchase_order_id" IS NULL
        AND "equipment"."stock_movement"."build_id" IS NULL
        AND "equipment"."stock_movement"."stocktake_session_id" IS NULL
        AND "equipment"."stock_movement"."delta" = 0
        AND "equipment"."stock_movement"."unit_cost" IS NOT NULL
        AND "equipment"."stock_movement"."reason" IS NULL
      ) OR (
        "equipment"."stock_movement"."movement_type" = 'checkout'
        AND (
          ("equipment"."stock_movement"."job_id" IS NOT NULL AND "equipment"."stock_movement"."quote_id" IS NULL AND "equipment"."stock_movement"."recipient_user_id" IS NULL AND "equipment"."stock_movement"."source_checkout_id" IS NULL)
          OR
          ("equipment"."stock_movement"."job_id" IS NULL AND "equipment"."stock_movement"."quote_id" IS NOT NULL AND "equipment"."stock_movement"."recipient_user_id" IS NULL AND "equipment"."stock_movement"."source_checkout_id" IS NULL)
          OR
          ("equipment"."stock_movement"."job_id" IS NULL AND "equipment"."stock_movement"."quote_id" IS NULL AND "equipment"."stock_movement"."recipient_user_id" IS NOT NULL AND "equipment"."stock_movement"."source_checkout_id" IS NULL AND "equipment"."stock_movement"."note" IS NOT NULL)
        )
        AND "equipment"."stock_movement"."purchase_order_id" IS NULL
        AND "equipment"."stock_movement"."build_id" IS NULL
        AND "equipment"."stock_movement"."stocktake_session_id" IS NULL
        AND "equipment"."stock_movement"."delta" < 0
        AND "equipment"."stock_movement"."reason" IS NULL
      ) OR (
        "equipment"."stock_movement"."movement_type" = 'return-to-store'
        AND (
          ("equipment"."stock_movement"."job_id" IS NOT NULL AND "equipment"."stock_movement"."quote_id" IS NULL AND "equipment"."stock_movement"."recipient_user_id" IS NULL AND "equipment"."stock_movement"."source_checkout_id" IS NULL)
          OR
          ("equipment"."stock_movement"."job_id" IS NULL AND "equipment"."stock_movement"."quote_id" IS NOT NULL AND "equipment"."stock_movement"."recipient_user_id" IS NULL AND "equipment"."stock_movement"."source_checkout_id" IS NULL)
          OR
          ("equipment"."stock_movement"."job_id" IS NULL AND "equipment"."stock_movement"."quote_id" IS NULL AND "equipment"."stock_movement"."recipient_user_id" IS NOT NULL AND "equipment"."stock_movement"."source_checkout_id" IS NOT NULL)
        )
        AND "equipment"."stock_movement"."purchase_order_id" IS NULL
        AND "equipment"."stock_movement"."build_id" IS NULL
        AND "equipment"."stock_movement"."stocktake_session_id" IS NULL
        AND "equipment"."stock_movement"."delta" > 0
        AND "equipment"."stock_movement"."reason" IS NULL
      ) OR (
        "equipment"."stock_movement"."movement_type" = 'receipt'
        AND "equipment"."stock_movement"."job_id" IS NULL
        AND "equipment"."stock_movement"."quote_id" IS NULL
        AND "equipment"."stock_movement"."recipient_user_id" IS NULL
        AND "equipment"."stock_movement"."source_checkout_id" IS NULL
        AND "equipment"."stock_movement"."purchase_order_id" IS NOT NULL
        AND "equipment"."stock_movement"."build_id" IS NULL
        AND "equipment"."stock_movement"."stocktake_session_id" IS NULL
        AND "equipment"."stock_movement"."delta" > 0
        AND "equipment"."stock_movement"."reason" IS NULL
        AND "equipment"."stock_movement"."unit_cost" IS NOT NULL
      ) OR (
        "equipment"."stock_movement"."movement_type" = 'return-to-supplier'
        AND "equipment"."stock_movement"."job_id" IS NULL
        AND "equipment"."stock_movement"."quote_id" IS NULL
        AND "equipment"."stock_movement"."recipient_user_id" IS NULL
        AND "equipment"."stock_movement"."source_checkout_id" IS NULL
        AND "equipment"."stock_movement"."purchase_order_id" IS NOT NULL
        AND "equipment"."stock_movement"."build_id" IS NULL
        AND "equipment"."stock_movement"."stocktake_session_id" IS NULL
        AND "equipment"."stock_movement"."delta" < 0
        AND "equipment"."stock_movement"."reason" IN ('wrong-item', 'defective', 'order-error')
      ) OR (
        "equipment"."stock_movement"."movement_type" = 'build-consume'
        AND "equipment"."stock_movement"."job_id" IS NULL
        AND "equipment"."stock_movement"."quote_id" IS NULL
        AND "equipment"."stock_movement"."recipient_user_id" IS NULL
        AND "equipment"."stock_movement"."source_checkout_id" IS NULL
        AND "equipment"."stock_movement"."purchase_order_id" IS NULL
        AND "equipment"."stock_movement"."build_id" IS NOT NULL
        AND "equipment"."stock_movement"."stocktake_session_id" IS NULL
        AND "equipment"."stock_movement"."delta" < 0
        AND "equipment"."stock_movement"."reason" IS NULL
      ) OR (
        "equipment"."stock_movement"."movement_type" = 'build-produce'
        AND "equipment"."stock_movement"."job_id" IS NULL
        AND "equipment"."stock_movement"."quote_id" IS NULL
        AND "equipment"."stock_movement"."recipient_user_id" IS NULL
        AND "equipment"."stock_movement"."source_checkout_id" IS NULL
        AND "equipment"."stock_movement"."purchase_order_id" IS NULL
        AND "equipment"."stock_movement"."build_id" IS NOT NULL
        AND "equipment"."stock_movement"."stocktake_session_id" IS NULL
        AND "equipment"."stock_movement"."delta" > 0
        AND "equipment"."stock_movement"."reason" IS NULL
      ));--> statement-breakpoint
-- Which Quotes may be drawn to is a fact on another table, so a CHECK cannot express it.
CREATE FUNCTION "equipment"."enforce_stock_movement_quote_is_parts_sale"() RETURNS trigger
LANGUAGE plpgsql AS $$
BEGIN
  IF NEW."quote_id" IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM "equipment"."quote" WHERE "id" = NEW."quote_id" AND "is_parts_sale"
  ) THEN
    RAISE EXCEPTION 'Stock may only be drawn to a Parts Sale'
      USING ERRCODE = '23514', CONSTRAINT = 'stock_movement_quote_is_parts_sale';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "stock_movement_quote_is_parts_sale"
BEFORE INSERT ON "equipment"."stock_movement"
FOR EACH ROW EXECUTE FUNCTION "equipment"."enforce_stock_movement_quote_is_parts_sale"();--> statement-breakpoint
-- A linked return must point at a Checkout Without a Job, which a Parts Sale Checkout is not.
CREATE OR REPLACE FUNCTION "equipment"."enforce_stock_movement_source_checkout"() RETURNS trigger
LANGUAGE plpgsql AS $$
DECLARE
  source_row "equipment"."stock_movement"%ROWTYPE;
BEGIN
  IF NEW."source_checkout_id" IS NOT NULL THEN
    SELECT * INTO source_row
    FROM "equipment"."stock_movement"
    WHERE "id" = NEW."source_checkout_id";

    IF NOT FOUND
      OR source_row."movement_type" <> 'checkout'
      OR source_row."job_id" IS NOT NULL
      OR source_row."quote_id" IS NOT NULL
      OR NEW."part_id" IS DISTINCT FROM source_row."part_id"
      OR NEW."recipient_user_id" IS DISTINCT FROM source_row."recipient_user_id"
      OR NEW."length_mm" IS DISTINCT FROM source_row."length_mm"
    THEN
      RAISE EXCEPTION 'Linked Return to Store must inherit its source Checkout identity'
        USING ERRCODE = '23514', CONSTRAINT = 'stock_movement_source_checkout_identity';
    END IF;
  END IF;

  RETURN NEW;
END;
$$;
