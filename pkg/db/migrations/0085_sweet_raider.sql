ALTER TABLE "quote_work_items" DROP CONSTRAINT "quote_work_items_name_nonempty";--> statement-breakpoint
ALTER TABLE "quote" DROP CONSTRAINT "quote_hourly_rate_shape";--> statement-breakpoint
ALTER TABLE "quote" DROP CONSTRAINT "quote_kind_shape";--> statement-breakpoint
ALTER TABLE "quote_work_items" ALTER COLUMN "name" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "quote_work_items" ADD COLUMN "department" text;--> statement-breakpoint
ALTER TABLE "quote_work_items" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "quote_work_items" ADD COLUMN "hourly_rate" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
-- Existing Work Items become department-less "Other" items, which are priced as one unit at a flat
-- amount rather than as labour. Collapsing the old hours into that amount keeps every total identical
-- while making the row read correctly in the editors, which hide Hours on a department-less row.
UPDATE "quote_work_items" AS "wi"
SET "hourly_rate" = round("wi"."hours" * "q"."hourly_rate", 2), "hours" = 1
FROM "quote" AS "q"
WHERE "q"."id" = "wi"."quote_id" AND "q"."hourly_rate" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" DROP COLUMN "hourly_rate";--> statement-breakpoint
ALTER TABLE "quote_work_items" ADD CONSTRAINT "quote_work_items_name_shape" CHECK ((
        "quote_work_items"."department" is null and "quote_work_items"."name" is not null and length(trim("quote_work_items"."name")) > 0
      ) or (
        "quote_work_items"."department" is not null and "quote_work_items"."name" is null
      ));--> statement-breakpoint
ALTER TABLE "quote_work_items" ADD CONSTRAINT "quote_work_items_department_value_check" CHECK ("quote_work_items"."department" is null or "quote_work_items"."department" in ('procurement', 'supply', 'fabrication', 'paint', 'assembly'));--> statement-breakpoint
ALTER TABLE "quote_work_items" ADD CONSTRAINT "quote_work_items_hourly_rate_nonnegative" CHECK ("quote_work_items"."hourly_rate" >= 0);--> statement-breakpoint
-- Base price is pinned to zero on Custom Quotes below. Any Custom Quote still carrying one becomes an
-- "Other" Work Item priced 1 x the entered amount, so the quote total is unchanged to the cent.
INSERT INTO "quote_work_items" ("quote_id", "name", "department", "hours", "hourly_rate", "position")
SELECT
  "q"."id",
  'Base price',
  NULL,
  1,
  "q"."quoted_base_price",
  COALESCE((SELECT MAX("wi"."position") + 1 FROM "quote_work_items" AS "wi" WHERE "wi"."quote_id" = "q"."id"), 0)
FROM "quote" AS "q"
WHERE "q"."kind" = 'custom' AND "q"."quoted_base_price" <> 0;--> statement-breakpoint
UPDATE "quote" SET "quoted_base_price" = 0 WHERE "kind" = 'custom' AND "quoted_base_price" <> 0;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_kind_shape" CHECK ((
        "quote"."kind" = 'product' and "quote"."product_id" is not null and "quote"."work_title" is null
      ) or (
        "quote"."kind" = 'custom' and "quote"."product_id" is null and "quote"."work_title" is not null and length(trim("quote"."work_title")) > 0 and "quote"."quoted_base_price" = 0
      ));
