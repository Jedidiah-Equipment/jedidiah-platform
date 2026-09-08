CREATE TABLE "contracting"."work_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "work_type_name_not_blank" CHECK (length(btrim("contracting"."work_type"."name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "work_type_name_ci_unique" ON "contracting"."work_type" USING btree (lower("name"));