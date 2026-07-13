UPDATE "quote"
SET "delivery_included" = ("delivery_price" = 0)
WHERE "delivery_included" <> ("delivery_price" = 0);--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_delivery_inclusion_matches_price" CHECK ("quote"."delivery_included" = ("quote"."delivery_price" = 0));
