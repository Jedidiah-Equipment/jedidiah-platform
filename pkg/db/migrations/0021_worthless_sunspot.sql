ALTER TABLE "job_stage_station" RENAME COLUMN "due_start" TO "planned_start";--> statement-breakpoint
ALTER TABLE "job_stage_station" RENAME COLUMN "due_end" TO "planned_end";--> statement-breakpoint
ALTER TABLE "job_stage_station" DROP COLUMN "due_start_set_manually";--> statement-breakpoint
ALTER TABLE "job_stage_station" DROP COLUMN "due_end_set_manually";--> statement-breakpoint
ALTER TABLE "job_stage_station" DROP COLUMN "actual_start_set_manually";--> statement-breakpoint
ALTER TABLE "job_stage_station" DROP COLUMN "actual_end_set_manually";--> statement-breakpoint
ALTER TABLE "job_stage" DROP COLUMN "due_start";--> statement-breakpoint
ALTER TABLE "job_stage" DROP COLUMN "due_start_set_manually";--> statement-breakpoint
ALTER TABLE "job_stage" DROP COLUMN "due_end";--> statement-breakpoint
ALTER TABLE "job_stage" DROP COLUMN "due_end_set_manually";--> statement-breakpoint
ALTER TABLE "job_stage" DROP COLUMN "actual_start";--> statement-breakpoint
ALTER TABLE "job_stage" DROP COLUMN "actual_start_set_manually";--> statement-breakpoint
ALTER TABLE "job_stage" DROP COLUMN "actual_end";--> statement-breakpoint
ALTER TABLE "job_stage" DROP COLUMN "actual_end_set_manually";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "due_start";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "due_start_set_manually";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "due_end";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "due_end_set_manually";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "actual_start";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "actual_start_set_manually";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "actual_end";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "actual_end_set_manually";