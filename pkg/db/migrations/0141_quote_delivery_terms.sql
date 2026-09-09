ALTER TABLE "equipment"."quote" ADD COLUMN "delivery_terms" text DEFAULT 'included' NOT NULL;--> statement-breakpoint
-- Every unticked "delivery included" Quote was an additional charge: the old check constraint tied the
-- tick to a zero price, so the boolean maps one-to-one and nothing becomes ex factory or TBC here.
UPDATE "equipment"."quote" SET "delivery_terms" = 'additional_charge' WHERE "delivery_included" = false;--> statement-breakpoint
ALTER TABLE "equipment"."quote" DROP CONSTRAINT "quote_delivery_inclusion_matches_price";--> statement-breakpoint
ALTER TABLE "equipment"."quote" DROP COLUMN "delivery_included";--> statement-breakpoint
ALTER TABLE "equipment"."quote" ADD CONSTRAINT "quote_delivery_terms_valid" CHECK ("equipment"."quote"."delivery_terms" in ('included', 'additional_charge', 'ex_factory', 'tbc'));--> statement-breakpoint
ALTER TABLE "equipment"."quote" ADD CONSTRAINT "quote_delivery_charge_matches_price" CHECK (("equipment"."quote"."delivery_terms" = 'additional_charge') = ("equipment"."quote"."delivery_price" > 0));