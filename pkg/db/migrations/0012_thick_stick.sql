CREATE SEQUENCE "job_code_seq" START WITH 1 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "code" integer;--> statement-breakpoint
WITH numbered_jobs AS (
  SELECT "id", row_number() OVER (ORDER BY "created_at", "id") AS "code"
  FROM "job"
)
UPDATE "job"
SET "code" = numbered_jobs."code"
FROM numbered_jobs
WHERE "job"."id" = numbered_jobs."id";--> statement-breakpoint
SELECT setval('"job_code_seq"', COALESCE((SELECT max("code") FROM "job"), 1), (SELECT count(*) > 0 FROM "job"));--> statement-breakpoint
ALTER TABLE "job" ALTER COLUMN "code" SET DEFAULT nextval('job_code_seq'::regclass);--> statement-breakpoint
ALTER TABLE "job" ALTER COLUMN "code" SET NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "job_code_unique" ON "job" USING btree ("code");
