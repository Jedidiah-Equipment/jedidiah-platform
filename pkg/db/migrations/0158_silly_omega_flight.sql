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
-- One Part Category per name ignoring casing and whitespace runs. Where spellings differ only that way,
-- the most-used wins. Inner whitespace collapses to one space, as the application stores names.
INSERT INTO "equipment"."part_category" ("name")
SELECT DISTINCT ON (lower(ranked."name")) ranked."name"
FROM (
  SELECT "name", count(*) OVER (PARTITION BY "name") AS uses
  FROM (SELECT regexp_replace(trim("category"), '[ \t\n\r\f\v]+', ' ', 'g') AS "name" FROM "equipment"."parts") normalized
) ranked
ORDER BY lower(ranked."name"), ranked.uses DESC, ranked."name";--> statement-breakpoint
UPDATE "equipment"."parts" p
SET "category_id" = c."id"
FROM "equipment"."part_category" c
WHERE lower(regexp_replace(trim(p."category"), '[ \t\n\r\f\v]+', ' ', 'g')) = lower(c."name");--> statement-breakpoint
ALTER TABLE "equipment"."parts" ALTER COLUMN "category_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "equipment"."parts" ADD CONSTRAINT "parts_category_id_part_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "equipment"."part_category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
DROP INDEX "equipment"."parts_category_idx";--> statement-breakpoint
CREATE INDEX "parts_category_id_idx" ON "equipment"."parts" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "equipment"."parts" DROP COLUMN "category";
