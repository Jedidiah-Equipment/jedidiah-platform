ALTER TABLE "contracting"."category" DROP CONSTRAINT "category_colour";--> statement-breakpoint
-- Categories get their own hues: red, green, blue and grey now mean Breakdown status and urgency.
UPDATE "contracting"."category" SET "colour" = CASE "colour"
  WHEN 'blue' THEN 'cyan'
  WHEN 'teal' THEN 'cyan'
  WHEN 'green' THEN 'lime'
  WHEN 'gray' THEN 'indigo'
  WHEN 'red' THEN 'pink'
  WHEN 'purple' THEN 'violet'
  ELSE "colour"
END
WHERE "colour" IN ('blue', 'teal', 'green', 'gray', 'red', 'purple');--> statement-breakpoint
ALTER TABLE "contracting"."category" ADD CONSTRAINT "category_colour" CHECK ("contracting"."category"."colour" IN ('yellow', 'orange', 'lime', 'cyan', 'indigo', 'violet', 'fuchsia', 'pink'));
