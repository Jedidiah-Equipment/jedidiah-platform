DROP INDEX "supplier_company_name_unique";--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
CREATE UNIQUE INDEX "supplier_company_name_unique" ON "supplier" USING btree ("company_name") WHERE "supplier"."deleted_at" is null;