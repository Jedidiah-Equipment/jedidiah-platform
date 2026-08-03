ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_type_check";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_shape";--> statement-breakpoint
ALTER TABLE "purchase_order" ADD COLUMN "closed_short_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "stock_movement_purchase_order_part_idx" ON "stock_movement" USING btree ("purchase_order_id","part_id");--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_closed_short_shape" CHECK ("purchase_order"."closed_short_at" IS NULL OR "purchase_order"."status" = 'sent');--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_type_check" CHECK ("stock_movement"."movement_type" IN ('adjustment', 'revaluation', 'checkout', 'return-to-store', 'receipt'));--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_shape" CHECK ((
        "stock_movement"."movement_type" = 'adjustment'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."reason" IS NOT NULL
        AND ("stock_movement"."reason" = 'opening-balance' OR "stock_movement"."note" IS NOT NULL)
        AND ("stock_movement"."unit_cost" IS NULL OR "stock_movement"."reason" = 'opening-balance')
      ) OR (
        "stock_movement"."movement_type" = 'revaluation'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."delta" = 0
        AND "stock_movement"."unit_cost" IS NOT NULL
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'checkout'
        AND "stock_movement"."job_id" IS NOT NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."delta" < 0
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'return-to-store'
        AND "stock_movement"."job_id" IS NOT NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."delta" > 0
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'receipt'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NOT NULL
        AND "stock_movement"."delta" > 0
        AND "stock_movement"."reason" IS NULL
        AND "stock_movement"."unit_cost" IS NOT NULL
      ));