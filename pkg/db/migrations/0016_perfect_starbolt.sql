CREATE TABLE "job_stage_station" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_stage_id" uuid NOT NULL,
	"station_id" uuid NOT NULL,
	"due_start" date,
	"due_start_set_manually" boolean DEFAULT false NOT NULL,
	"due_end" date,
	"due_end_set_manually" boolean DEFAULT false NOT NULL,
	"actual_start" timestamp with time zone,
	"actual_start_set_manually" boolean DEFAULT false NOT NULL,
	"actual_end" timestamp with time zone,
	"actual_end_set_manually" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "station" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"department" text NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "job_stage" ADD COLUMN "due_start" date;--> statement-breakpoint
ALTER TABLE "job_stage" ADD COLUMN "due_start_set_manually" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_stage" ADD COLUMN "due_end" date;--> statement-breakpoint
ALTER TABLE "job_stage" ADD COLUMN "due_end_set_manually" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_stage" ADD COLUMN "actual_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_stage" ADD COLUMN "actual_start_set_manually" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_stage" ADD COLUMN "actual_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job_stage" ADD COLUMN "actual_end_set_manually" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "due_start" date;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "due_start_set_manually" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "due_end" date;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "due_end_set_manually" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "actual_start" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "actual_start_set_manually" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "actual_end" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "actual_end_set_manually" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "is_paused" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "is_cancelled" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "job_stage_station" ADD CONSTRAINT "job_stage_station_job_stage_id_job_stage_id_fk" FOREIGN KEY ("job_stage_id") REFERENCES "public"."job_stage"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stage_station" ADD CONSTRAINT "job_stage_station_station_id_station_id_fk" FOREIGN KEY ("station_id") REFERENCES "public"."station"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "job_stage_station_job_stage_id_idx" ON "job_stage_station" USING btree ("job_stage_id");--> statement-breakpoint
CREATE INDEX "job_stage_station_station_id_idx" ON "job_stage_station" USING btree ("station_id");--> statement-breakpoint
CREATE INDEX "station_department_display_order_idx" ON "station" USING btree ("department","display_order");--> statement-breakpoint
CREATE UNIQUE INDEX "station_department_name_unique" ON "station" USING btree ("department","name");--> statement-breakpoint
ALTER TABLE "job_stage" DROP COLUMN "status";--> statement-breakpoint
ALTER TABLE "job_stage" DROP COLUMN "started_at";--> statement-breakpoint
ALTER TABLE "job_stage" DROP COLUMN "completed_at";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "due_date";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "lifecycle_status";