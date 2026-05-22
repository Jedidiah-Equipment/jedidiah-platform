ALTER TABLE "job" ADD COLUMN "status" text DEFAULT 'pending' NOT NULL;--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "is_paused";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "is_cancelled";