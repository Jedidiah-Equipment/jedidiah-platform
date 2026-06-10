CREATE TABLE "job_bay_operator_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"bay_id" uuid NOT NULL,
	"operator_user_id" text NOT NULL,
	"assigned_at" timestamp with time zone DEFAULT now() NOT NULL,
	"unassigned_at" timestamp with time zone,
	CONSTRAINT "job_bay_operator_assignment_interval_order" CHECK ("job_bay_operator_assignment"."unassigned_at" IS NULL OR "job_bay_operator_assignment"."unassigned_at" >= "job_bay_operator_assignment"."assigned_at")
);
--> statement-breakpoint
ALTER TABLE "job_bay_operator_assignment" ADD CONSTRAINT "job_bay_operator_assignment_bay_id_job_bay_id_fk" FOREIGN KEY ("bay_id") REFERENCES "public"."job_bay"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_bay_operator_assignment" ADD CONSTRAINT "job_bay_operator_assignment_operator_user_id_user_id_fk" FOREIGN KEY ("operator_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_bay_operator_assignment_open_bay_unique" ON "job_bay_operator_assignment" USING btree ("bay_id") WHERE "job_bay_operator_assignment"."unassigned_at" IS NULL;