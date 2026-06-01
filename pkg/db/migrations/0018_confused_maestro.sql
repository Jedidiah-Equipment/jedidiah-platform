ALTER TABLE "documents" DROP CONSTRAINT "documents_exactly_one_owner";--> statement-breakpoint
DROP INDEX "documents_storage_key_unique";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "source_product_id" uuid;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_source_product_id_products_id_fk" FOREIGN KEY ("source_product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_job_id_created_at_idx" ON "documents" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_job_id_filename_ci_unique" ON "documents" USING btree ("job_id",lower("filename"));--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_product_rows_have_no_source" CHECK ("documents"."owner_type" <> 'product' OR "documents"."source_product_id" IS NULL);--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_exactly_one_owner" CHECK (("documents"."owner_type" = 'product' AND "documents"."product_id" IS NOT NULL AND "documents"."job_id" IS NULL) OR ("documents"."owner_type" = 'job' AND "documents"."job_id" IS NOT NULL AND "documents"."product_id" IS NULL));