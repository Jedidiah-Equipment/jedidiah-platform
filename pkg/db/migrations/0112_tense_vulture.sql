ALTER TABLE "purchase_order_amendment" DROP CONSTRAINT "purchase_order_amendment_kind_check";--> statement-breakpoint
ALTER TABLE "purchase_order_amendment" DROP CONSTRAINT "purchase_order_amendment_shape";--> statement-breakpoint
ALTER TABLE "purchase_order_amendment" ALTER COLUMN "new_quantity" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_amendment" ALTER COLUMN "part_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_order_amendment" ADD COLUMN "new_expected_date" date;--> statement-breakpoint
ALTER TABLE "purchase_order_amendment" ADD COLUMN "old_expected_date" date;--> statement-breakpoint
ALTER TABLE "purchase_order_amendment" ADD CONSTRAINT "purchase_order_amendment_kind_check" CHECK ("purchase_order_amendment"."kind" IN ('quantity-change', 'add-line', 'substitute-part', 'expected-date-change'));--> statement-breakpoint
ALTER TABLE "purchase_order_amendment" ADD CONSTRAINT "purchase_order_amendment_shape" CHECK ((
        "purchase_order_amendment"."kind" = 'quantity-change'
        AND "purchase_order_amendment"."part_id" IS NOT NULL
        AND "purchase_order_amendment"."new_part_id" IS NULL
        AND "purchase_order_amendment"."new_quantity" IS NOT NULL
        AND "purchase_order_amendment"."old_quantity" IS NOT NULL
        AND "purchase_order_amendment"."old_expected_date" IS NULL
        AND "purchase_order_amendment"."new_expected_date" IS NULL
      ) OR (
        "purchase_order_amendment"."kind" = 'add-line'
        AND "purchase_order_amendment"."part_id" IS NOT NULL
        AND "purchase_order_amendment"."new_part_id" IS NULL
        AND "purchase_order_amendment"."new_quantity" IS NOT NULL
        AND "purchase_order_amendment"."old_quantity" IS NULL
        AND "purchase_order_amendment"."old_expected_date" IS NULL
        AND "purchase_order_amendment"."new_expected_date" IS NULL
      ) OR (
        "purchase_order_amendment"."kind" = 'substitute-part'
        AND "purchase_order_amendment"."part_id" IS NOT NULL
        AND "purchase_order_amendment"."new_part_id" IS NOT NULL
        AND "purchase_order_amendment"."new_part_id" <> "purchase_order_amendment"."part_id"
        AND "purchase_order_amendment"."new_quantity" IS NOT NULL
        AND "purchase_order_amendment"."old_quantity" IS NOT NULL
        AND "purchase_order_amendment"."old_expected_date" IS NULL
        AND "purchase_order_amendment"."new_expected_date" IS NULL
      ) OR (
        "purchase_order_amendment"."kind" = 'expected-date-change'
        AND "purchase_order_amendment"."part_id" IS NULL
        AND "purchase_order_amendment"."new_part_id" IS NULL
        AND "purchase_order_amendment"."new_quantity" IS NULL
        AND "purchase_order_amendment"."old_quantity" IS NULL
        AND "purchase_order_amendment"."new_expected_date" IS NOT NULL
      ));