ALTER TABLE "products" RENAME COLUMN "lead_time_days" TO "build_time_days";--> statement-breakpoint
ALTER TABLE "products" RENAME CONSTRAINT "products_lead_time_days_nonnegative" TO "products_build_time_days_nonnegative";
