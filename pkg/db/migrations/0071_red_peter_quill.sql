ALTER TABLE "user" ADD COLUMN "assistant_enabled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "user" SET "assistant_enabled" = true WHERE "role" IN ('admin', 'super-admin');