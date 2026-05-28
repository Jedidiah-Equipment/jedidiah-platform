ALTER TABLE "quote" ADD COLUMN "delivery_included" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ADD COLUMN "delivery_price" numeric(12, 2) DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_delivery_price_nonnegative" CHECK ("quote"."delivery_price" >= 0);