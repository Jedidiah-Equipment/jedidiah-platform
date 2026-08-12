ALTER TABLE "product_assemblies" ADD COLUMN "is_publicly_visible" boolean DEFAULT false NOT NULL;--> statement-breakpoint
UPDATE "product_assemblies" SET "is_publicly_visible" = true;
