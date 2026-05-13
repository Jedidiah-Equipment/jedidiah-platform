DELETE FROM "audit_events" WHERE "entity_type" = 'product';--> statement-breakpoint
DELETE FROM "products";--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "base_price" numeric(12, 2) NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "currency_code" text DEFAULT 'ZAR' NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "description" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "model_code" text NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "products_model_code_unique" ON "products" USING btree ("model_code");--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_base_price_nonnegative" CHECK ("products"."base_price" >= 0);
