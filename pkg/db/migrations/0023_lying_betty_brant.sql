-- Pre-production: documents predate the metadata bag and cannot be backfilled, so wipe them.
DELETE FROM "documents";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "metadata" jsonb NOT NULL;
