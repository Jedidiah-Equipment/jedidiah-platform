CREATE TABLE "job_build_spec_assembly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"product_assembly_id" uuid,
	"assembly_name" text NOT NULL,
	"sequence" integer NOT NULL,
	CONSTRAINT "job_build_spec_assembly_name_nonempty" CHECK (length(trim("job_build_spec_assembly"."assembly_name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "job_build_spec_assembly" ADD CONSTRAINT "job_build_spec_assembly_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_build_spec_assembly" ADD CONSTRAINT "job_build_spec_assembly_product_assembly_id_product_assemblies_id_fk" FOREIGN KEY ("product_assembly_id") REFERENCES "public"."product_assemblies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_build_spec_assembly_job_product_assembly_unique" ON "job_build_spec_assembly" USING btree ("job_id","product_assembly_id");