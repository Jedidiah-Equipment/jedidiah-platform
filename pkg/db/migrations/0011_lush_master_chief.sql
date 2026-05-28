ALTER TABLE "job" DROP CONSTRAINT "job_status_check";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "due_date";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "status";