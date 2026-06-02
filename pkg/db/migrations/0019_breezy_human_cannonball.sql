ALTER TABLE "quote" RENAME COLUMN "discount" TO "discount_amount";--> statement-breakpoint
ALTER TABLE "quote" DROP CONSTRAINT "quote_discount_nonnegative";--> statement-breakpoint
ALTER TABLE "quote" DROP CONSTRAINT "quote_discount_not_above_snapshot";--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "deposit_amount" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_discount_amount_nonnegative" CHECK ("quote"."discount_amount" >= 0);--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_discount_amount_not_above_snapshot" CHECK ("quote"."discount_amount" <= "quote"."quoted_base_price");--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_deposit_amount_nonnegative" CHECK ("quote"."deposit_amount" >= 0);