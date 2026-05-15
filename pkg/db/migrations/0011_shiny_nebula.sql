CREATE TABLE "job_event" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"stage_id" uuid,
	"event_type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"actor_user_id" text,
	"occurred_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_event" ADD CONSTRAINT "job_event_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_event" ADD CONSTRAINT "job_event_stage_id_job_stage_id_fk" FOREIGN KEY ("stage_id") REFERENCES "public"."job_stage"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_event" ADD CONSTRAINT "job_event_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_event_job_id_occurred_at_idx" ON "job_event" USING btree ("job_id","occurred_at");--> statement-breakpoint
CREATE INDEX "job_event_stage_id_occurred_at_idx" ON "job_event" USING btree ("stage_id","occurred_at");