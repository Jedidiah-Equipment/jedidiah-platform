CREATE TABLE "job_department_crew" (
	"job_id" uuid NOT NULL,
	"department" text NOT NULL,
	"crew_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_department_crew_pkey" PRIMARY KEY("job_id","department","crew_user_id")
);
--> statement-breakpoint
CREATE TABLE "job_department_timing" (
	"job_id" uuid NOT NULL,
	"department" text NOT NULL,
	"started_at" timestamp with time zone NOT NULL,
	"completed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_department_timing_pkey" PRIMARY KEY("job_id","department"),
	CONSTRAINT "job_department_timing_department_check" CHECK ("job_department_timing"."department" IN ('fabrication', 'paint', 'assembly', 'workshop')),
	CONSTRAINT "job_department_timing_stamp_order" CHECK ("job_department_timing"."completed_at" IS NULL OR "job_department_timing"."completed_at" >= "job_department_timing"."started_at")
);
--> statement-breakpoint
ALTER TABLE "job_department_crew" ADD CONSTRAINT "job_department_crew_crew_user_id_user_id_fk" FOREIGN KEY ("crew_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_department_crew" ADD CONSTRAINT "job_department_crew_timing_fk" FOREIGN KEY ("job_id","department") REFERENCES "public"."job_department_timing"("job_id","department") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_department_timing" ADD CONSTRAINT "job_department_timing_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;