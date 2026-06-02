ALTER TABLE "job" ADD COLUMN "vin_number" text;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "requires_vin_number" boolean DEFAULT false NOT NULL;