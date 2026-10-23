-- Transcription becomes one business-blind mechanism in `public` (ADR 0024). The tables move with their rows,
-- constraints, foreign keys and indexes; every existing row was spoken in Contracting.
ALTER TABLE "contracting"."transcription" SET SCHEMA "public";--> statement-breakpoint
ALTER TABLE "contracting"."transcription_hint" SET SCHEMA "public";--> statement-breakpoint
ALTER TABLE "transcription" ADD COLUMN "business" text DEFAULT 'contracting' NOT NULL;--> statement-breakpoint
ALTER TABLE "transcription" ALTER COLUMN "business" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "transcription" ADD CONSTRAINT "transcription_business" CHECK ("transcription"."business" IN ('equipment', 'contracting'));--> statement-breakpoint
ALTER TABLE "transcription_hint" ADD COLUMN "business" text DEFAULT 'contracting' NOT NULL;--> statement-breakpoint
ALTER TABLE "transcription_hint" ALTER COLUMN "business" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "transcription_hint" ADD CONSTRAINT "transcription_hint_business" CHECK ("transcription_hint"."business" IN ('equipment', 'contracting'));--> statement-breakpoint
DROP INDEX "transcription_hint_active_idx";--> statement-breakpoint
CREATE INDEX "transcription_hint_business_active_idx" ON "transcription_hint" USING btree ("business","retired_at","created_at");--> statement-breakpoint
CREATE INDEX "transcription_business_created_idx" ON "transcription" USING btree ("business","created_at");
