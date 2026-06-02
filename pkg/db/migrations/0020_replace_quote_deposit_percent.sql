ALTER TABLE "quote" DROP CONSTRAINT "quote_deposit_amount_nonnegative";--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "deposit_percent" numeric(5, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
UPDATE "quote" SET "deposit_percent" = 0;--> statement-breakpoint
ALTER TABLE "quote" DROP COLUMN "deposit_amount";--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_deposit_percent_nonnegative" CHECK ("quote"."deposit_percent" >= 0);--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_deposit_percent_not_above_100" CHECK ("quote"."deposit_percent" <= 100);
