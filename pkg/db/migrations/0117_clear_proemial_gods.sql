CREATE TABLE "job_estimate_snapshot" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_id" uuid PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_estimate_snapshot" ADD CONSTRAINT "job_estimate_snapshot_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;