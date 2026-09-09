ALTER TABLE "equipment"."product_labor_hours" ADD COLUMN "days_per_staff" numeric(6, 2);--> statement-breakpoint
ALTER TABLE "equipment"."product_labor_hours" ADD COLUMN "staff_count" integer;--> statement-breakpoint
-- Backfill at one staff member and nine hours a day; the 0.01 floor keeps rows under 0.045 h positive.
UPDATE "equipment"."product_labor_hours" SET "days_per_staff" = GREATEST(ROUND("hours" / 9, 2), 0.01), "staff_count" = 1;--> statement-breakpoint
ALTER TABLE "equipment"."product_labor_hours" ALTER COLUMN "days_per_staff" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment"."product_labor_hours" ALTER COLUMN "staff_count" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment"."product_labor_hours" DROP CONSTRAINT "product_labor_hours_hours_positive";--> statement-breakpoint
ALTER TABLE "equipment"."product_labor_hours" DROP COLUMN "hours";--> statement-breakpoint
ALTER TABLE "equipment"."product_labor_hours" ADD CONSTRAINT "product_labor_hours_days_per_staff_positive" CHECK ("equipment"."product_labor_hours"."days_per_staff" > 0);--> statement-breakpoint
ALTER TABLE "equipment"."product_labor_hours" ADD CONSTRAINT "product_labor_hours_staff_count_min" CHECK ("equipment"."product_labor_hours"."staff_count" >= 1);