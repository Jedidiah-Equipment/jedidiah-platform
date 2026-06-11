-- Convert stored schedule origins to whole plant business dates (ADR-0043).
-- The USING clause pins the legacy instant -> business date conversion to the plant
-- timezone, so the result does not depend on the session TimeZone running the migration.
ALTER TABLE "job_bay" ALTER COLUMN "schedule_origin" SET DATA TYPE date USING ("schedule_origin" AT TIME ZONE 'Africa/Johannesburg')::date;--> statement-breakpoint
ALTER TABLE "job_bay" ALTER COLUMN "schedule_origin" DROP DEFAULT;
