ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_type_check";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_shape";--> statement-breakpoint
ALTER TABLE "stock_movement" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_type_check" CHECK ("stock_movement"."movement_type" IN ('adjustment', 'revaluation', 'checkout', 'return-to-store'));--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_shape" CHECK ((
        "stock_movement"."movement_type" = 'adjustment'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."reason" IS NOT NULL
        AND ("stock_movement"."reason" = 'opening-balance' OR "stock_movement"."note" IS NOT NULL)
        AND ("stock_movement"."unit_cost" IS NULL OR "stock_movement"."reason" = 'opening-balance')
      ) OR (
        "stock_movement"."movement_type" = 'revaluation'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."delta" = 0
        AND "stock_movement"."unit_cost" IS NOT NULL
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'checkout'
        AND "stock_movement"."job_id" IS NOT NULL
        AND "stock_movement"."delta" < 0
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'return-to-store'
        AND "stock_movement"."job_id" IS NOT NULL
        AND "stock_movement"."delta" > 0
        AND "stock_movement"."reason" IS NULL
      ));