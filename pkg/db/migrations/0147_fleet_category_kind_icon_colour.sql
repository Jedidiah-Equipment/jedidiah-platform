-- No real fleet data exists on any environment (#1434): the migration clears fleet rows outright
-- rather than inventing implement categories. Readings go first because their machine FK restricts.
DELETE FROM "contracting"."hour_reading";--> statement-breakpoint
DELETE FROM "contracting"."implement";--> statement-breakpoint
DELETE FROM "contracting"."machine";--> statement-breakpoint
ALTER TABLE "contracting"."category" DROP CONSTRAINT "category_rate_nonnegative";--> statement-breakpoint
DROP INDEX "contracting"."category_name_ci_unique";--> statement-breakpoint
ALTER TABLE "contracting"."category" DROP COLUMN "preset_rate";--> statement-breakpoint
-- Surviving categories only ever grouped machines; they backfill to the machine defaults.
ALTER TABLE "contracting"."category" ADD COLUMN "kind" text DEFAULT 'machine' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracting"."category" ADD COLUMN "icon" text DEFAULT 'generic-machine' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracting"."category" ADD COLUMN "colour" text DEFAULT 'gray' NOT NULL;--> statement-breakpoint
ALTER TABLE "contracting"."category" ALTER COLUMN "kind" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "contracting"."category" ALTER COLUMN "icon" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "contracting"."category" ALTER COLUMN "colour" DROP DEFAULT;--> statement-breakpoint
ALTER TABLE "contracting"."implement" DROP COLUMN "implement_type";--> statement-breakpoint
ALTER TABLE "contracting"."implement" ADD COLUMN "category_id" uuid NOT NULL;--> statement-breakpoint
ALTER TABLE "contracting"."implement" ADD CONSTRAINT "implement_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "contracting"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_kind_name_ci_unique" ON "contracting"."category" USING btree ("kind",lower("name"));--> statement-breakpoint
CREATE INDEX "implement_category_idx" ON "contracting"."implement" USING btree ("category_id");--> statement-breakpoint
ALTER TABLE "contracting"."category" ADD CONSTRAINT "category_kind" CHECK ("contracting"."category"."kind" IN ('machine', 'implement'));--> statement-breakpoint
ALTER TABLE "contracting"."category" ADD CONSTRAINT "category_colour" CHECK ("contracting"."category"."colour" IN ('blue', 'gray', 'green', 'orange', 'purple', 'red', 'teal', 'yellow'));--> statement-breakpoint
-- A category reference must match the referencing table's kind. Like the driver role in 0134, a
-- CHECK cannot span rows, so both write directions participate: taking a reference share-locks the
-- category, and a kind change holds its update lock while checking for references.
CREATE FUNCTION contracting.check_category_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  PERFORM 1 FROM contracting.category
    WHERE id = NEW.category_id AND kind = TG_ARGV[0] FOR SHARE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Select a % category.', TG_ARGV[0]
      USING ERRCODE = '23503', CONSTRAINT = TG_TABLE_NAME || '_category_kind';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER machine_category_kind
  BEFORE INSERT OR UPDATE OF category_id ON contracting.machine
  FOR EACH ROW EXECUTE FUNCTION contracting.check_category_kind('machine');
--> statement-breakpoint
CREATE TRIGGER implement_category_kind
  BEFORE INSERT OR UPDATE OF category_id ON contracting.implement
  FOR EACH ROW EXECUTE FUNCTION contracting.check_category_kind('implement');
--> statement-breakpoint
CREATE FUNCTION contracting.protect_referenced_category_kind() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.kind IS DISTINCT FROM OLD.kind
    AND (EXISTS (SELECT 1 FROM contracting.machine WHERE category_id = OLD.id)
      OR EXISTS (SELECT 1 FROM contracting.implement WHERE category_id = OLD.id)) THEN
    RAISE EXCEPTION 'Move the Machines or Implements out of this category before changing its kind.'
      USING ERRCODE = '23503', CONSTRAINT = 'category_kind_in_use';
  END IF;
  RETURN NEW;
END;
$$;
--> statement-breakpoint
CREATE TRIGGER category_kind_in_use
  BEFORE UPDATE OF kind ON contracting.category
  FOR EACH ROW EXECUTE FUNCTION contracting.protect_referenced_category_kind();
