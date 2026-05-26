TRUNCATE "products" RESTART IDENTITY CASCADE;--> statement-breakpoint
ALTER TABLE "products" ADD COLUMN "lead_time_days" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_lead_time_days_nonnegative" CHECK ("products"."lead_time_days" >= 0);
