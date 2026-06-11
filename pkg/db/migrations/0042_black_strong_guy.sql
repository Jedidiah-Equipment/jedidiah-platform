ALTER TABLE "quote" RENAME COLUMN "discount_amount" TO "discount_percent";--> statement-breakpoint
ALTER TABLE "quote" DROP CONSTRAINT "quote_discount_amount_nonnegative";--> statement-breakpoint
ALTER TABLE "quote" DROP CONSTRAINT "quote_discount_amount_not_above_snapshot";--> statement-breakpoint
UPDATE "quote" SET "discount_percent" = 0;--> statement-breakpoint
ALTER TABLE "quote" ALTER COLUMN "discount_percent" SET DATA TYPE numeric(5, 2);--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_discount_percent_nonnegative" CHECK ("quote"."discount_percent" >= 0);--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_discount_percent_not_above_100" CHECK ("quote"."discount_percent" <= 100);
