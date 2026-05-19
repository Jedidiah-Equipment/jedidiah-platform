UPDATE "user" SET "role" = 'sales' WHERE "role" IN ('product-viewer', 'job-viewer');--> statement-breakpoint
ALTER TABLE "user" ALTER COLUMN "role" SET DEFAULT 'sales';
