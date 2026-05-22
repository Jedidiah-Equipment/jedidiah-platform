ALTER TABLE "job" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_status_check" CHECK ("status" in ('pending', 'active', 'paused', 'complete', 'cancelled'));--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "is_paused";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "is_cancelled";
