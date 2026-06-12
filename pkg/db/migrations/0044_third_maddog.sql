ALTER TABLE "quote" ADD COLUMN "status_changed_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Approximate backfill: pre-existing quotes have no status-change history, so their last update stands in.
UPDATE "quote" SET "status_changed_at" = "updated_at";