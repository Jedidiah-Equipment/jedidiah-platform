ALTER TABLE "equipment"."purchase_order_amendment" DROP CONSTRAINT "purchase_order_amendment_kind_check";--> statement-breakpoint
ALTER TABLE "equipment"."purchase_order_amendment" DROP CONSTRAINT "purchase_order_amendment_shape";--> statement-breakpoint
ALTER TABLE "equipment"."purchase_order_amendment" ADD COLUMN "custom_description" text;--> statement-breakpoint
ALTER TABLE "equipment"."purchase_order_amendment" ADD COLUMN "line_id" uuid;--> statement-breakpoint
ALTER TABLE "equipment"."purchase_order_amendment" ADD CONSTRAINT "purchase_order_amendment_kind_check" CHECK ("equipment"."purchase_order_amendment"."kind" IN ('quantity-change', 'add-line', 'substitute-part', 'expected-date-change', 'remove-line'));--> statement-breakpoint
ALTER TABLE "equipment"."purchase_order_amendment" ADD CONSTRAINT "purchase_order_amendment_shape" CHECK ((
        "equipment"."purchase_order_amendment"."kind" = 'quantity-change'
        AND (
      ("equipment"."purchase_order_amendment"."part_id" IS NOT NULL AND "equipment"."purchase_order_amendment"."line_id" IS NULL AND "equipment"."purchase_order_amendment"."custom_description" IS NULL)
      OR ("equipment"."purchase_order_amendment"."part_id" IS NULL AND "equipment"."purchase_order_amendment"."line_id" IS NOT NULL AND length(trim(coalesce("equipment"."purchase_order_amendment"."custom_description", ''))) > 0)
    )
        AND "equipment"."purchase_order_amendment"."new_part_id" IS NULL
        AND "equipment"."purchase_order_amendment"."new_quantity" IS NOT NULL
        AND "equipment"."purchase_order_amendment"."old_quantity" IS NOT NULL
        AND "equipment"."purchase_order_amendment"."old_expected_date" IS NULL
        AND "equipment"."purchase_order_amendment"."new_expected_date" IS NULL
      ) OR (
        "equipment"."purchase_order_amendment"."kind" = 'add-line'
        AND (
      ("equipment"."purchase_order_amendment"."part_id" IS NOT NULL AND "equipment"."purchase_order_amendment"."line_id" IS NULL AND "equipment"."purchase_order_amendment"."custom_description" IS NULL)
      OR ("equipment"."purchase_order_amendment"."part_id" IS NULL AND "equipment"."purchase_order_amendment"."line_id" IS NOT NULL AND length(trim(coalesce("equipment"."purchase_order_amendment"."custom_description", ''))) > 0)
    )
        AND "equipment"."purchase_order_amendment"."new_part_id" IS NULL
        AND "equipment"."purchase_order_amendment"."new_quantity" IS NOT NULL
        AND "equipment"."purchase_order_amendment"."old_quantity" IS NULL
        AND "equipment"."purchase_order_amendment"."old_expected_date" IS NULL
        AND "equipment"."purchase_order_amendment"."new_expected_date" IS NULL
      ) OR (
        "equipment"."purchase_order_amendment"."kind" = 'substitute-part'
        AND "equipment"."purchase_order_amendment"."part_id" IS NOT NULL
        AND "equipment"."purchase_order_amendment"."line_id" IS NULL AND "equipment"."purchase_order_amendment"."custom_description" IS NULL
        AND "equipment"."purchase_order_amendment"."new_part_id" IS NOT NULL
        AND "equipment"."purchase_order_amendment"."new_part_id" <> "equipment"."purchase_order_amendment"."part_id"
        AND "equipment"."purchase_order_amendment"."new_quantity" IS NOT NULL
        AND "equipment"."purchase_order_amendment"."old_quantity" IS NOT NULL
        AND "equipment"."purchase_order_amendment"."old_expected_date" IS NULL
        AND "equipment"."purchase_order_amendment"."new_expected_date" IS NULL
      ) OR (
        "equipment"."purchase_order_amendment"."kind" = 'expected-date-change'
        AND "equipment"."purchase_order_amendment"."part_id" IS NULL
        AND "equipment"."purchase_order_amendment"."line_id" IS NULL AND "equipment"."purchase_order_amendment"."custom_description" IS NULL
        AND "equipment"."purchase_order_amendment"."new_part_id" IS NULL
        AND "equipment"."purchase_order_amendment"."new_quantity" IS NULL
        AND "equipment"."purchase_order_amendment"."old_quantity" IS NULL
        AND "equipment"."purchase_order_amendment"."new_expected_date" IS NOT NULL
      ) OR (
        "equipment"."purchase_order_amendment"."kind" = 'remove-line'
        AND ("equipment"."purchase_order_amendment"."part_id" IS NULL AND "equipment"."purchase_order_amendment"."line_id" IS NOT NULL AND length(trim(coalesce("equipment"."purchase_order_amendment"."custom_description", ''))) > 0)
        AND "equipment"."purchase_order_amendment"."new_part_id" IS NULL
        AND "equipment"."purchase_order_amendment"."new_quantity" IS NULL
        AND "equipment"."purchase_order_amendment"."old_quantity" IS NOT NULL
        AND "equipment"."purchase_order_amendment"."old_expected_date" IS NULL
        AND "equipment"."purchase_order_amendment"."new_expected_date" IS NULL
      ));