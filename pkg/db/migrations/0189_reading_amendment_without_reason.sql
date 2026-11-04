ALTER TABLE "contracting"."hour_reading" DROP CONSTRAINT "hour_reading_amendment";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP COLUMN "amendment_reason";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" ADD CONSTRAINT "hour_reading_amendment" CHECK (("contracting"."hour_reading"."amended_by" IS NULL) = ("contracting"."hour_reading"."amended_at" IS NULL));