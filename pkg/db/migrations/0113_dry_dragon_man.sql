CREATE TABLE "stocktake_session" (
	"closed_at" timestamp with time zone,
	"closed_by_user_id" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"opened_at" timestamp with time zone DEFAULT now() NOT NULL,
	"opened_by_user_id" text NOT NULL,
	"scope" text NOT NULL,
	CONSTRAINT "stocktake_session_scope_check" CHECK ("stocktake_session"."scope" IN ('raw-material', 'stores')),
	CONSTRAINT "stocktake_session_closed_shape" CHECK (("stocktake_session"."closed_at" IS NULL) = ("stocktake_session"."closed_by_user_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_shape";--> statement-breakpoint
ALTER TABLE "stock_movement" ADD COLUMN "stocktake_session_id" uuid;--> statement-breakpoint
ALTER TABLE "stocktake_session" ADD CONSTRAINT "stocktake_session_closed_by_user_id_user_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stocktake_session" ADD CONSTRAINT "stocktake_session_opened_by_user_id_user_id_fk" FOREIGN KEY ("opened_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "stocktake_session_open_scope_idx" ON "stocktake_session" USING btree ("scope") WHERE "stocktake_session"."closed_at" IS NULL;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_stocktake_session_id_stocktake_session_id_fk" FOREIGN KEY ("stocktake_session_id") REFERENCES "public"."stocktake_session"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movement_stocktake_session_idx" ON "stock_movement" USING btree ("stocktake_session_id","part_id");--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_shape" CHECK ((
        "stock_movement"."movement_type" = 'adjustment'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."reason" IN ('opening-balance', 'stock-count', 'damage', 'scrap', 'correction')
        AND ("stock_movement"."stocktake_session_id" IS NULL OR "stock_movement"."reason" = 'stock-count')
        AND (
          "stock_movement"."reason" = 'opening-balance'
          OR "stock_movement"."stocktake_session_id" IS NOT NULL
          OR "stock_movement"."note" IS NOT NULL
        )
        AND ("stock_movement"."unit_cost" IS NULL OR "stock_movement"."reason" = 'opening-balance')
      ) OR (
        "stock_movement"."movement_type" = 'revaluation'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."stocktake_session_id" IS NULL
        AND "stock_movement"."delta" = 0
        AND "stock_movement"."unit_cost" IS NOT NULL
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'checkout'
        AND "stock_movement"."job_id" IS NOT NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."stocktake_session_id" IS NULL
        AND "stock_movement"."delta" < 0
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'return-to-store'
        AND "stock_movement"."job_id" IS NOT NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."stocktake_session_id" IS NULL
        AND "stock_movement"."delta" > 0
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'receipt'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NOT NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."stocktake_session_id" IS NULL
        AND "stock_movement"."delta" > 0
        AND "stock_movement"."reason" IS NULL
        AND "stock_movement"."unit_cost" IS NOT NULL
      ) OR (
        "stock_movement"."movement_type" = 'return-to-supplier'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NOT NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."stocktake_session_id" IS NULL
        AND "stock_movement"."delta" < 0
        AND "stock_movement"."reason" IN ('wrong-item', 'defective', 'order-error')
      ) OR (
        "stock_movement"."movement_type" = 'build-consume'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NOT NULL
        AND "stock_movement"."stocktake_session_id" IS NULL
        AND "stock_movement"."delta" < 0
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'build-produce'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NOT NULL
        AND "stock_movement"."stocktake_session_id" IS NULL
        AND "stock_movement"."delta" > 0
        AND "stock_movement"."reason" IS NULL
      ));