ALTER TABLE "job" DROP CONSTRAINT "job_invoice_number_nonempty";--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "invoice_number" text;--> statement-breakpoint
UPDATE "quote"
SET "invoice_number" = "job"."invoice_number"
FROM "job"
WHERE "job"."quote_id" = "quote"."id"
  AND "job"."invoice_number" IS NOT NULL;--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "invoice_number";--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_invoice_number_nonempty" CHECK ("quote"."invoice_number" IS NULL OR length(trim("quote"."invoice_number")) > 0);
