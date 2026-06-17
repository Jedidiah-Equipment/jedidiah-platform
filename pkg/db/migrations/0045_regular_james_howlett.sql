ALTER TABLE "products" ADD COLUMN "brochure_key_features" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "brochure_subtitle" text;