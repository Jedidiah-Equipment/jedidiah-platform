ALTER TABLE "job" ADD COLUMN "code" text;--> statement-breakpoint
UPDATE "job" SET "code" = 'JOB-' || upper(substr("id"::text, 1, 8));--> statement-breakpoint
ALTER TABLE "job" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "job_code_unique" ON "job" USING btree ("code");
