ALTER TABLE "user" ADD COLUMN "quote_salesperson" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "user" SET "quote_salesperson" = true WHERE "role" IN ('super-admin', 'admin', 'sales');
