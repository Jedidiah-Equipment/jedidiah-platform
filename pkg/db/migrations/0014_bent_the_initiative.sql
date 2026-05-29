ALTER TABLE "parts" ADD COLUMN "unit_of_measure" text;--> statement-breakpoint
UPDATE "parts" SET "unit_of_measure" = 'quantity' WHERE "unit_of_measure" IS NULL;--> statement-breakpoint
ALTER TABLE "parts" ALTER COLUMN "unit_of_measure" SET NOT NULL;
