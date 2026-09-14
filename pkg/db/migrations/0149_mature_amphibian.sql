ALTER TABLE "equipment"."stock_movement" DROP CONSTRAINT "stock_movement_shape";--> statement-breakpoint
ALTER TABLE "equipment"."stock_movement" ADD COLUMN "recipient_user_id" text;--> statement-breakpoint
ALTER TABLE "equipment"."stock_movement" ADD COLUMN "source_checkout_id" uuid;--> statement-breakpoint
ALTER TABLE "equipment"."stock_movement" ADD CONSTRAINT "stock_movement_recipient_user_id_user_id_fk" FOREIGN KEY ("recipient_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment"."stock_movement" ADD CONSTRAINT "stock_movement_source_checkout_fk" FOREIGN KEY ("source_checkout_id") REFERENCES "equipment"."stock_movement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movement_source_checkout_idx" ON "equipment"."stock_movement" USING btree ("source_checkout_id");--> statement-breakpoint
ALTER TABLE "equipment"."stock_movement" ADD CONSTRAINT "stock_movement_shape" CHECK ((
        "equipment"."stock_movement"."movement_type" = 'adjustment'
        AND "equipment"."stock_movement"."job_id" IS NULL
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
          ("equipment"."stock_movement"."job_id" IS NOT NULL AND "equipment"."stock_movement"."recipient_user_id" IS NULL AND "equipment"."stock_movement"."source_checkout_id" IS NULL)
          OR
          ("equipment"."stock_movement"."job_id" IS NULL AND "equipment"."stock_movement"."recipient_user_id" IS NOT NULL AND "equipment"."stock_movement"."source_checkout_id" IS NULL AND "equipment"."stock_movement"."note" IS NOT NULL)
        )
        AND "equipment"."stock_movement"."purchase_order_id" IS NULL
        AND "equipment"."stock_movement"."build_id" IS NULL
        AND "equipment"."stock_movement"."stocktake_session_id" IS NULL
        AND "equipment"."stock_movement"."delta" < 0
        AND "equipment"."stock_movement"."reason" IS NULL
      ) OR (
        "equipment"."stock_movement"."movement_type" = 'return-to-store'
        AND (
          ("equipment"."stock_movement"."job_id" IS NOT NULL AND "equipment"."stock_movement"."recipient_user_id" IS NULL AND "equipment"."stock_movement"."source_checkout_id" IS NULL)
          OR
          ("equipment"."stock_movement"."job_id" IS NULL AND "equipment"."stock_movement"."recipient_user_id" IS NOT NULL AND "equipment"."stock_movement"."source_checkout_id" IS NOT NULL)
        )
        AND "equipment"."stock_movement"."purchase_order_id" IS NULL
        AND "equipment"."stock_movement"."build_id" IS NULL
        AND "equipment"."stock_movement"."stocktake_session_id" IS NULL
        AND "equipment"."stock_movement"."delta" > 0
        AND "equipment"."stock_movement"."reason" IS NULL
      ) OR (
        "equipment"."stock_movement"."movement_type" = 'receipt'
        AND "equipment"."stock_movement"."job_id" IS NULL
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
        AND "equipment"."stock_movement"."recipient_user_id" IS NULL
        AND "equipment"."stock_movement"."source_checkout_id" IS NULL
        AND "equipment"."stock_movement"."purchase_order_id" IS NULL
        AND "equipment"."stock_movement"."build_id" IS NOT NULL
        AND "equipment"."stock_movement"."stocktake_session_id" IS NULL
        AND "equipment"."stock_movement"."delta" > 0
        AND "equipment"."stock_movement"."reason" IS NULL
      ));--> statement-breakpoint
CREATE FUNCTION "equipment"."enforce_stock_movement_source_checkout"() RETURNS trigger
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
      OR source_row."recipient_user_id" IS NULL
      OR source_row."source_checkout_id" IS NOT NULL
      OR NEW."part_id" IS DISTINCT FROM source_row."part_id"
      OR NEW."recipient_user_id" IS DISTINCT FROM source_row."recipient_user_id"
      OR NEW."length_mm" IS DISTINCT FROM source_row."length_mm"
    THEN
      RAISE EXCEPTION 'Linked Return to Store must inherit its source Checkout identity'
        USING ERRCODE = '23514', CONSTRAINT = 'stock_movement_source_checkout_identity';
    END IF;
  END IF;

  IF TG_OP = 'UPDATE'
    AND (
      NEW."movement_type" IS DISTINCT FROM OLD."movement_type"
      OR NEW."job_id" IS DISTINCT FROM OLD."job_id"
      OR NEW."part_id" IS DISTINCT FROM OLD."part_id"
      OR NEW."recipient_user_id" IS DISTINCT FROM OLD."recipient_user_id"
      OR NEW."length_mm" IS DISTINCT FROM OLD."length_mm"
      OR NEW."source_checkout_id" IS DISTINCT FROM OLD."source_checkout_id"
    )
    AND EXISTS (
      SELECT 1
      FROM "equipment"."stock_movement" child
      WHERE child."source_checkout_id" = OLD."id"
    )
  THEN
    RAISE EXCEPTION 'A Checkout linked to a Return to Store cannot change identity'
      USING ERRCODE = '23514', CONSTRAINT = 'stock_movement_source_checkout_identity';
  END IF;

  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER "stock_movement_source_checkout_identity"
BEFORE INSERT OR UPDATE ON "equipment"."stock_movement"
FOR EACH ROW EXECUTE FUNCTION "equipment"."enforce_stock_movement_source_checkout"();
