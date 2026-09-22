CREATE TABLE "equipment"."part_category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "part_category_name_nonempty" CHECK (length(trim("equipment"."part_category"."name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "part_category_name_ci_unique" ON "equipment"."part_category" USING btree (lower("name"));--> statement-breakpoint
ALTER TABLE "equipment"."parts" ADD COLUMN "category_id" uuid;--> statement-breakpoint
-- One Part Category per case-insensitive name. Where spellings differ only by case, the most-used wins.
INSERT INTO "equipment"."part_category" ("name")
SELECT DISTINCT ON (lower(trim(ranked."category"))) trim(ranked."category")
FROM (
  SELECT "category", count(*) OVER (PARTITION BY "category") AS uses FROM "equipment"."parts"
) ranked
ORDER BY lower(trim(ranked."category")), ranked.uses DESC, trim(ranked."category");--> statement-breakpoint
UPDATE "equipment"."parts" p
SET "category_id" = c."id"
FROM "equipment"."part_category" c
WHERE lower(trim(p."category")) = lower(c."name");--> statement-breakpoint
ALTER TABLE "equipment"."parts" ALTER COLUMN "category_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment"."parts" ADD CONSTRAINT "parts_category_id_part_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "equipment"."part_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
DROP INDEX "equipment"."parts_category_idx";--> statement-breakpoint
CREATE INDEX "parts_category_id_idx" ON "equipment"."parts" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "equipment"."parts" DROP COLUMN "category";
