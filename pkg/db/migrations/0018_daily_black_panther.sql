DELETE FROM "job_event" WHERE "event_type" = 'stage.status_changed';--> statement-breakpoint
ALTER TABLE "quote" ALTER COLUMN "product_id" DROP NOT NULL;
