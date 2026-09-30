CREATE TABLE "equipment"."part_import_batch_member" (
	"batch_id" uuid NOT NULL,
	"line_number" integer NOT NULL,
	"outcome" text NOT NULL,
	"part_code" text NOT NULL,
	"part_id" uuid,
	"part_name" text NOT NULL,
	CONSTRAINT "part_import_batch_member_pkey" PRIMARY KEY("batch_id","line_number"),
	CONSTRAINT "part_import_batch_member_outcome_check" CHECK ("equipment"."part_import_batch_member"."outcome" IN ('created', 'updated', 'unchanged')),
	CONSTRAINT "part_import_batch_member_line_number_positive" CHECK ("equipment"."part_import_batch_member"."line_number" >= 1)
);
--> statement-breakpoint
CREATE TABLE "equipment"."part_import_batch" (
	"completed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_count" integer NOT NULL,
	"file_name" text,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"imported_by_user_id" text,
	"rejected_count" integer NOT NULL,
	"unchanged_count" integer NOT NULL,
	"updated_count" integer NOT NULL,
	CONSTRAINT "part_import_batch_counts_nonnegative" CHECK ("equipment"."part_import_batch"."created_count" >= 0 AND "equipment"."part_import_batch"."updated_count" >= 0 AND "equipment"."part_import_batch"."unchanged_count" >= 0 AND "equipment"."part_import_batch"."rejected_count" >= 0)
);
--> statement-breakpoint
ALTER TABLE "equipment"."part_import_batch_member" ADD CONSTRAINT "part_import_batch_member_batch_id_part_import_batch_id_fk" FOREIGN KEY ("batch_id") REFERENCES "equipment"."part_import_batch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment"."part_import_batch_member" ADD CONSTRAINT "part_import_batch_member_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "equipment"."parts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "equipment"."part_import_batch" ADD CONSTRAINT "part_import_batch_imported_by_user_id_user_id_fk" FOREIGN KEY ("imported_by_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "part_import_batch_member_part_id_idx" ON "equipment"."part_import_batch_member" USING btree ("part_id");--> statement-breakpoint
CREATE INDEX "part_import_batch_completed_at_idx" ON "equipment"."part_import_batch" USING btree ("completed_at" DESC NULLS LAST,"id" DESC NULLS LAST);