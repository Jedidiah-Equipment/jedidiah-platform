DELETE FROM "job_stage";--> statement-breakpoint
DELETE FROM "job";--> statement-breakpoint
CREATE TABLE "job_cfo_assembly" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"assembly_name" text NOT NULL,
	"kind" text NOT NULL,
	CONSTRAINT "job_cfo_assembly_name_nonempty" CHECK (length(trim("job_cfo_assembly"."assembly_name")) > 0),
	CONSTRAINT "job_cfo_assembly_kind_check" CHECK ("job_cfo_assembly"."kind" IN ('standard', 'optional'))
);
--> statement-breakpoint
CREATE TABLE "job_cfo_part" (
	"cfo_assembly_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "job_cfo_part_pkey" PRIMARY KEY("cfo_assembly_id","part_id"),
	CONSTRAINT "job_cfo_part_quantity_positive" CHECK ("job_cfo_part"."quantity" > 0)
);
--> statement-breakpoint
DROP INDEX "job_quote_id_idx";--> statement-breakpoint
ALTER TABLE "job" ALTER COLUMN "quote_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "job_cfo_assembly" ADD CONSTRAINT "job_cfo_assembly_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cfo_part" ADD CONSTRAINT "job_cfo_part_cfo_assembly_id_job_cfo_assembly_id_fk" FOREIGN KEY ("cfo_assembly_id") REFERENCES "public"."job_cfo_assembly"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_cfo_part" ADD CONSTRAINT "job_cfo_part_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_quote_id_unique" ON "job" USING btree ("quote_id");
