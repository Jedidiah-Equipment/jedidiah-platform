ALTER TABLE "contracting"."hour_reading" DROP CONSTRAINT "hour_reading_confidence";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP CONSTRAINT "hour_reading_verification";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP CONSTRAINT "hour_reading_value";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP CONSTRAINT "hour_reading_method";--> statement-breakpoint
UPDATE "contracting"."hour_reading" SET "method" = 'manual' WHERE "method" = 'photo';--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP COLUMN "photo";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP COLUMN "ai_value";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP COLUMN "ai_confidence";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP COLUMN "ai_verification";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP COLUMN "evidence_reviewed_at";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" ADD CONSTRAINT "hour_reading_value" CHECK ("contracting"."hour_reading"."value" >= 0);--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" ADD CONSTRAINT "hour_reading_method" CHECK (("contracting"."hour_reading"."method" = 'manual' AND "contracting"."hour_reading"."captured_by_user_id" IS NOT NULL AND "contracting"."hour_reading"."telematics_provider" IS NULL) OR ("contracting"."hour_reading"."method" = 'telematics' AND "contracting"."hour_reading"."captured_by_user_id" IS NULL AND "contracting"."hour_reading"."telematics_provider" IS NOT NULL AND "contracting"."hour_reading"."role" = 'spot' AND "contracting"."hour_reading"."comment" IS NULL AND "contracting"."hour_reading"."disputed" = false AND "contracting"."hour_reading"."amended_by" IS NULL));