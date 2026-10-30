ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "arrival_hours" numeric(10, 1);--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "arrival_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "arrival_by_user_id" text;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "arrival_comment" text;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "arrival_telematics_hours" numeric(10, 1);--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "arrival_telematics_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "departure_hours" numeric(10, 1);--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "departure_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "departure_by_user_id" text;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "departure_comment" text;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "departure_telematics_hours" numeric(10, 1);--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "departure_telematics_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "travel_hours" numeric(10, 1);--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "travel_clamped" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "travel_set_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "travel_set_by_user_id" text;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "hours_amended_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "hours_amended_by_user_id" text;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD COLUMN "hours_amendment_reason" text;--> statement-breakpoint
-- Job Hours leave the ledger: each stint takes its readings' values, acceptance moments, capturers and comments.
UPDATE "contracting"."machine_assignment" stint
SET "arrival_hours" = arrival.value,
  "arrival_at" = arrival.created_at,
  "arrival_by_user_id" = arrival.captured_by_user_id,
  "arrival_comment" = arrival.comment
FROM "contracting"."hour_reading" arrival
WHERE arrival.id = stint.arrival_reading_id;--> statement-breakpoint
UPDATE "contracting"."machine_assignment" stint
SET "departure_hours" = departure.value,
  "departure_at" = departure.created_at,
  "departure_by_user_id" = departure.captured_by_user_id,
  "departure_comment" = departure.comment
FROM "contracting"."hour_reading" departure
WHERE departure.id = stint.departure_reading_id;--> statement-breakpoint
UPDATE "contracting"."machine_assignment" stint
SET "hours_amended_at" = amended.amended_at,
  "hours_amended_by_user_id" = amended.amended_by,
  "hours_amendment_reason" = amended.amendment_reason
FROM (
  SELECT DISTINCT ON (candidate.stint_id) candidate.stint_id, reading.amended_at, reading.amended_by, reading.amendment_reason
  FROM (
    SELECT id AS stint_id, arrival_reading_id AS reading_id FROM "contracting"."machine_assignment"
    UNION ALL
    SELECT id, departure_reading_id FROM "contracting"."machine_assignment"
  ) candidate
  JOIN "contracting"."hour_reading" reading ON reading.id = candidate.reading_id
  WHERE reading.amended_at IS NOT NULL
  ORDER BY candidate.stint_id, reading.amended_at DESC
) amended
WHERE amended.stint_id = stint.id;--> statement-breakpoint
-- Travel as it bills today: a resolved gap's Travel Hours, else the gap from the Machine's previous departure when included.
UPDATE "contracting"."machine_assignment" stint
SET "travel_hours" = coalesce(
    stint.gap_travel_hours,
    CASE
      WHEN stint.travel_included THEN greatest(0, arrival.value - coalesce((
        SELECT previous.value
        FROM "contracting"."hour_reading" previous
        WHERE previous.machine_id = stint.machine_id
          AND previous.role = 'departure'
          AND (previous.captured_at, previous.sequence) < (arrival.captured_at, arrival.sequence)
        ORDER BY previous.captured_at DESC, previous.sequence DESC
        LIMIT 1
      ), arrival.value))
      ELSE 0
    END
  ),
  "travel_set_at" = stint.gap_resolved_at,
  "travel_set_by_user_id" = stint.gap_resolved_by_user_id
FROM "contracting"."hour_reading" arrival
WHERE arrival.id = stint.arrival_reading_id;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" DROP CONSTRAINT "machine_assignment_departure_needs_arrival";--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" DROP CONSTRAINT "machine_assignment_gap_shape";--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" DROP CONSTRAINT "machine_assignment_arrival_reading_id_hour_reading_id_fk";--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" DROP CONSTRAINT "machine_assignment_departure_reading_id_hour_reading_id_fk";--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" DROP CONSTRAINT "machine_assignment_gap_resolved_by_user_id_user_id_fk";--> statement-breakpoint
DROP INDEX "contracting"."machine_assignment_arrival_unique";--> statement-breakpoint
DROP INDEX "contracting"."machine_assignment_departure_unique";--> statement-breakpoint
DROP INDEX "contracting"."machine_assignment_machine_on_site_unique";--> statement-breakpoint
DROP INDEX "contracting"."machine_assignment_implement_on_site_unique";--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" DROP COLUMN "arrival_reading_id";--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" DROP COLUMN "departure_reading_id";--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" DROP COLUMN "travel_included";--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" DROP COLUMN "gap_travel_hours";--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" DROP COLUMN "gap_unaccounted_hours";--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" DROP COLUMN "gap_reason";--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" DROP COLUMN "gap_resolved_at";--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" DROP COLUMN "gap_resolved_by_user_id";--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_arrival_by_user_id_user_id_fk" FOREIGN KEY ("arrival_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_departure_by_user_id_user_id_fk" FOREIGN KEY ("departure_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_travel_set_by_user_id_user_id_fk" FOREIGN KEY ("travel_set_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_hours_amended_by_user_id_user_id_fk" FOREIGN KEY ("hours_amended_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "machine_assignment_arrival_idx" ON "contracting"."machine_assignment" USING btree ("arrival_at","id");--> statement-breakpoint
CREATE INDEX "machine_assignment_departure_idx" ON "contracting"."machine_assignment" USING btree ("departure_at","id");--> statement-breakpoint
CREATE UNIQUE INDEX "machine_assignment_machine_on_site_unique" ON "contracting"."machine_assignment" USING btree ("machine_id") WHERE "contracting"."machine_assignment"."arrival_hours" IS NOT NULL AND "contracting"."machine_assignment"."departure_hours" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "machine_assignment_implement_on_site_unique" ON "contracting"."machine_assignment" USING btree ("implement_id") WHERE "contracting"."machine_assignment"."implement_id" IS NOT NULL AND "contracting"."machine_assignment"."arrival_hours" IS NOT NULL AND "contracting"."machine_assignment"."departure_hours" IS NULL;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_arrival_shape" CHECK ((("contracting"."machine_assignment"."arrival_hours" IS NULL) = ("contracting"."machine_assignment"."arrival_at" IS NULL) AND ("contracting"."machine_assignment"."arrival_hours" IS NULL) = ("contracting"."machine_assignment"."arrival_by_user_id" IS NULL)) AND ("contracting"."machine_assignment"."arrival_telematics_hours" IS NULL) = ("contracting"."machine_assignment"."arrival_telematics_at" IS NULL));--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_departure_shape" CHECK ((("contracting"."machine_assignment"."departure_hours" IS NULL) = ("contracting"."machine_assignment"."departure_at" IS NULL) AND ("contracting"."machine_assignment"."departure_hours" IS NULL) = ("contracting"."machine_assignment"."departure_by_user_id" IS NULL)) AND ("contracting"."machine_assignment"."departure_telematics_hours" IS NULL) = ("contracting"."machine_assignment"."departure_telematics_at" IS NULL));--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_departure_needs_arrival" CHECK ("contracting"."machine_assignment"."departure_hours" IS NULL OR "contracting"."machine_assignment"."arrival_hours" IS NOT NULL);--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_departure_after_arrival" CHECK ("contracting"."machine_assignment"."departure_hours" IS NULL OR "contracting"."machine_assignment"."departure_hours" >= "contracting"."machine_assignment"."arrival_hours");--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_travel_shape" CHECK (("contracting"."machine_assignment"."travel_hours" IS NULL) = ("contracting"."machine_assignment"."arrival_hours" IS NULL) AND ("contracting"."machine_assignment"."travel_hours" IS NULL OR "contracting"."machine_assignment"."travel_hours" >= 0) AND ("contracting"."machine_assignment"."travel_set_at" IS NULL) = ("contracting"."machine_assignment"."travel_set_by_user_id" IS NULL));--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_amendment_shape" CHECK (("contracting"."machine_assignment"."hours_amended_at" IS NULL AND "contracting"."machine_assignment"."hours_amended_by_user_id" IS NULL AND "contracting"."machine_assignment"."hours_amendment_reason" IS NULL) OR ("contracting"."machine_assignment"."hours_amended_at" IS NOT NULL AND "contracting"."machine_assignment"."hours_amended_by_user_id" IS NOT NULL AND length(btrim("contracting"."machine_assignment"."hours_amendment_reason")) > 0));--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP CONSTRAINT "hour_reading_disputed_previous_id_hour_reading_id_fk";--> statement-breakpoint
DELETE FROM "contracting"."hour_reading" WHERE "role" IN ('arrival', 'departure');--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP CONSTRAINT "hour_reading_role";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP CONSTRAINT "hour_reading_method";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP COLUMN "role";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP COLUMN "disputed";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP COLUMN "dispute_reason";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" DROP COLUMN "disputed_previous_id";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" ADD CONSTRAINT "hour_reading_method" CHECK (("contracting"."hour_reading"."method" = 'manual' AND "contracting"."hour_reading"."captured_by_user_id" IS NOT NULL AND "contracting"."hour_reading"."telematics_provider" IS NULL AND "contracting"."hour_reading"."telematics_link_id" IS NULL) OR ("contracting"."hour_reading"."method" = 'telematics' AND "contracting"."hour_reading"."captured_by_user_id" IS NULL AND "contracting"."hour_reading"."telematics_provider" IS NOT NULL AND "contracting"."hour_reading"."telematics_link_id" IS NOT NULL AND "contracting"."hour_reading"."comment" IS NULL AND "contracting"."hour_reading"."amended_by" IS NULL));--> statement-breakpoint
ALTER TABLE "contracting"."settings" RENAME COLUMN "gap_flag_threshold_hours" TO "travel_flag_threshold_hours";--> statement-breakpoint
ALTER TABLE "contracting"."settings" DROP CONSTRAINT "settings_gap_flag_threshold_bounds";--> statement-breakpoint
ALTER TABLE "contracting"."settings" ADD CONSTRAINT "settings_travel_flag_threshold_bounds" CHECK ("contracting"."settings"."travel_flag_threshold_hours" between 0.5 and 48);--> statement-breakpoint
ALTER TABLE "contracting"."settings" ADD COLUMN "john_deere_difference_threshold_hours" numeric(10, 1) DEFAULT 10 NOT NULL;--> statement-breakpoint
ALTER TABLE "contracting"."settings" ADD CONSTRAINT "settings_john_deere_difference_threshold_bounds" CHECK ("contracting"."settings"."john_deere_difference_threshold_hours" between 1 and 200);
