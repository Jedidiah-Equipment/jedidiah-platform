CREATE TABLE "contracting"."job_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_note_text_not_blank" CHECK (length(btrim("contracting"."job_note"."text")) > 0)
);
--> statement-breakpoint
ALTER TABLE "user" ADD COLUMN "last_activity_seen_map" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
-- Equipment keeps its mark; Contracting starts at the rollout, so an existing account never finds the history unread.
UPDATE "user" SET "last_activity_seen_map" = jsonb_build_object(
	'equipment', to_char("last_activity_seen" AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
	'contracting', to_char(now() AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'));--> statement-breakpoint
ALTER TABLE "user" DROP COLUMN "last_activity_seen";--> statement-breakpoint
ALTER TABLE "user" RENAME COLUMN "last_activity_seen_map" TO "last_activity_seen";--> statement-breakpoint
ALTER TABLE "contracting"."breakdown" ADD COLUMN "mechanic_assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracting"."breakdown" ADD COLUMN "mechanic_assigned_by_user_id" text;--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" ADD COLUMN "created_at" timestamp with time zone DEFAULT now();--> statement-breakpoint
-- History never recorded acceptance apart from Read At, so the past reads as accepted when it was read.
UPDATE "contracting"."hour_reading" SET "created_at" = "captured_at";--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" ALTER COLUMN "created_at" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "contracting"."job" ADD COLUMN "activated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "contracting"."job" ADD COLUMN "activated_by_user_id" text;--> statement-breakpoint
UPDATE "contracting"."job" SET "activated_at" = "first_arrival"."captured_at", "activated_by_user_id" = "first_arrival"."captured_by_user_id"
FROM (
	SELECT DISTINCT ON ("assignment"."job_id") "assignment"."job_id", "reading"."captured_at", "reading"."captured_by_user_id"
	FROM "contracting"."machine_assignment" "assignment"
	JOIN "contracting"."hour_reading" "reading" ON "reading"."id" = "assignment"."arrival_reading_id"
	ORDER BY "assignment"."job_id", "reading"."captured_at", "reading"."id"
) "first_arrival"
WHERE "first_arrival"."job_id" = "contracting"."job"."id" AND "contracting"."job"."status" <> 'upcoming';--> statement-breakpoint
ALTER TABLE "contracting"."job_note" ADD CONSTRAINT "job_note_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "contracting"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."job_note" ADD CONSTRAINT "job_note_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_note_job_idx" ON "contracting"."job_note" USING btree ("job_id","created_at");--> statement-breakpoint
CREATE INDEX "job_note_created_idx" ON "contracting"."job_note" USING btree ("created_at","id");--> statement-breakpoint
ALTER TABLE "contracting"."breakdown" ADD CONSTRAINT "breakdown_mechanic_assigned_by_user_id_user_id_fk" FOREIGN KEY ("mechanic_assigned_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."job" ADD CONSTRAINT "job_activated_by_user_id_user_id_fk" FOREIGN KEY ("activated_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "breakdown_note_created_idx" ON "contracting"."breakdown_note" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "breakdown_reported_idx" ON "contracting"."breakdown" USING btree ("reported_at","id");--> statement-breakpoint
CREATE INDEX "breakdown_started_idx" ON "contracting"."breakdown" USING btree ("started_at","id");--> statement-breakpoint
CREATE INDEX "breakdown_solved_idx" ON "contracting"."breakdown" USING btree ("solved_at","id");--> statement-breakpoint
CREATE INDEX "breakdown_mechanic_assigned_idx" ON "contracting"."breakdown" USING btree ("mechanic_assigned_at","id");--> statement-breakpoint
CREATE INDEX "hour_reading_created_idx" ON "contracting"."hour_reading" USING btree ("created_at","id");--> statement-breakpoint
CREATE INDEX "job_activated_idx" ON "contracting"."job" USING btree ("activated_at","id");--> statement-breakpoint
CREATE INDEX "job_completed_idx" ON "contracting"."job" USING btree ("completed_at","id");--> statement-breakpoint
CREATE INDEX "job_cancelled_idx" ON "contracting"."job" USING btree ("cancelled_at","id");