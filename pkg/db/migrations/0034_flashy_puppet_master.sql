DELETE FROM "job_slot";--> statement-breakpoint
ALTER TABLE "job_slot" RENAME COLUMN "duration_minutes" TO "duration_days";--> statement-breakpoint
ALTER TABLE "job_slot" DROP CONSTRAINT "job_slot_duration_minutes_positive";--> statement-breakpoint
ALTER TABLE "job_slot" ALTER COLUMN "job_stage_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job_slot" ADD COLUMN "kind" text NOT NULL;--> statement-breakpoint
ALTER TABLE "job_slot" ADD COLUMN "label" text;--> statement-breakpoint
ALTER TABLE "job_slot" ADD CONSTRAINT "job_slot_kind_check" CHECK ("job_slot"."kind" IN ('work', 'idle'));--> statement-breakpoint
ALTER TABLE "job_slot" ADD CONSTRAINT "job_slot_work_stage_required_idle_stage_forbidden" CHECK (("job_slot"."kind" = 'work' AND "job_slot"."job_stage_id" IS NOT NULL) OR ("job_slot"."kind" = 'idle' AND "job_slot"."job_stage_id" IS NULL));--> statement-breakpoint
ALTER TABLE "job_slot" ADD CONSTRAINT "job_slot_idle_label_only" CHECK ("job_slot"."label" IS NULL OR "job_slot"."kind" = 'idle');--> statement-breakpoint
ALTER TABLE "job_slot" ADD CONSTRAINT "job_slot_label_nonempty" CHECK ("job_slot"."label" IS NULL OR length(trim("job_slot"."label")) > 0);--> statement-breakpoint
ALTER TABLE "job_slot" ADD CONSTRAINT "job_slot_duration_days_positive" CHECK ("job_slot"."duration_days" > 0);
