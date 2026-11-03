-- Travel on a clamped stint the Job has not yet Priced or Invoiced, unless set by hand, re-snapshotted as an arrival
-- snapshots it now: the arrival less the Machine's highest departure at or below it on any other stint, else 0.
UPDATE "contracting"."machine_assignment" AS stint
SET "travel_hours" = stint.arrival_hours - coalesce((
    SELECT max(other.departure_hours)
    FROM "contracting"."machine_assignment" AS other
    WHERE other.machine_id = stint.machine_id
      AND other.id <> stint.id
      AND other.departure_hours <= stint.arrival_hours
  ), stint.arrival_hours)
FROM "contracting"."job" AS job
WHERE job.id = stint.job_id
  AND job.status NOT IN ('priced', 'invoiced')
  AND stint.travel_clamped
  AND stint.travel_set_at IS NULL;--> statement-breakpoint
DELETE FROM "contracting"."attention_dismissal" WHERE "kind" = 'travel-clamped';--> statement-breakpoint
ALTER TABLE "contracting"."attention_dismissal" DROP CONSTRAINT "attention_dismissal_kind";--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" DROP COLUMN "travel_clamped";--> statement-breakpoint
ALTER TABLE "contracting"."attention_dismissal" ADD CONSTRAINT "attention_dismissal_kind" CHECK ("contracting"."attention_dismissal"."kind" IN ('travel-over-threshold', 'john-deere-difference'));
