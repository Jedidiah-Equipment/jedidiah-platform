ALTER TABLE "job_cfo_assembly" ADD COLUMN "sequence" integer;--> statement-breakpoint
UPDATE "job_cfo_assembly" AS ca
SET "sequence" = ordered.rn
FROM (
  SELECT
    "id",
    row_number() OVER (PARTITION BY "job_id", "kind" ORDER BY "assembly_name" ASC) - 1 AS rn
  FROM "job_cfo_assembly"
) AS ordered
WHERE ca."id" = ordered."id";--> statement-breakpoint
ALTER TABLE "job_cfo_assembly" ALTER COLUMN "sequence" SET NOT NULL;