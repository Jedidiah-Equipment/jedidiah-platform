DELETE FROM "job_slot";--> statement-breakpoint
ALTER TABLE "job_slot" DROP CONSTRAINT "job_slot_work_stage_required_idle_stage_forbidden";--> statement-breakpoint
ALTER TABLE "job_slot" DROP CONSTRAINT "job_slot_job_stage_id_job_stage_id_fk";
--> statement-breakpoint
ALTER TABLE "job_slot" ADD COLUMN "job_id" uuid;--> statement-breakpoint
ALTER TABLE "job_slot" ADD CONSTRAINT "job_slot_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_slot" DROP COLUMN "job_stage_id";--> statement-breakpoint
ALTER TABLE "job_slot" ADD CONSTRAINT "job_slot_work_job_required_idle_job_forbidden" CHECK (("job_slot"."kind" = 'work' AND "job_slot"."job_id" IS NOT NULL) OR ("job_slot"."kind" = 'idle' AND "job_slot"."job_id" IS NULL));--> statement-breakpoint
ALTER TABLE "job_stage" DISABLE ROW LEVEL SECURITY;--> statement-breakpoint
DROP TABLE "job_stage" CASCADE;
