CREATE TABLE "job_slot" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bay_id" uuid NOT NULL,
	"job_stage_id" uuid NOT NULL,
	"sequence" integer NOT NULL,
	"duration_minutes" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_slot_bay_id_sequence_unique" UNIQUE("bay_id","sequence") DEFERRABLE INITIALLY DEFERRED,
	CONSTRAINT "job_slot_sequence_positive" CHECK ("job_slot"."sequence" > 0),
	CONSTRAINT "job_slot_duration_minutes_positive" CHECK ("job_slot"."duration_minutes" > 0)
);
--> statement-breakpoint
ALTER TABLE "job_slot" ADD CONSTRAINT "job_slot_bay_id_job_bay_id_fk" FOREIGN KEY ("bay_id") REFERENCES "public"."job_bay"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_slot" ADD CONSTRAINT "job_slot_job_stage_id_job_stage_id_fk" FOREIGN KEY ("job_stage_id") REFERENCES "public"."job_stage"("id") ON DELETE cascade ON UPDATE no action;
