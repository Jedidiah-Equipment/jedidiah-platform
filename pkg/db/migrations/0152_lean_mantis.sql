-- The issue #1503 duplicates were repaired before this migration was deployed. Hold writes while
-- checking that precondition and installing the case-insensitive constraint so no import can race
-- a new collision into the gap.
LOCK TABLE equipment.parts IN SHARE ROW EXCLUSIVE MODE;--> statement-breakpoint

DO $check$
BEGIN
  IF EXISTS (
    SELECT lower(code)
    FROM equipment.parts
    GROUP BY lower(code)
    HAVING count(*) > 1
  ) THEN
    RAISE EXCEPTION
      'Cannot enforce case-insensitive Part Codes while case-folded duplicates remain.';
  END IF;
END
$check$;--> statement-breakpoint

DROP INDEX "equipment"."parts_code_unique";--> statement-breakpoint
CREATE INDEX "parts_code_idx" ON "equipment"."parts" USING btree ("code");--> statement-breakpoint
CREATE UNIQUE INDEX "parts_code_unique" ON "equipment"."parts" USING btree (lower("code"));
