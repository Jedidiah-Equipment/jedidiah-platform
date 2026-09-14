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
      ));