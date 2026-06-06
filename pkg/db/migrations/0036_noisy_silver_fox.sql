CREATE TABLE "job_bay_calendar_exception" (
	"bay_id" uuid NOT NULL,
	"date" date NOT NULL,
	"direction" text NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_bay_calendar_exception_pkey" PRIMARY KEY("bay_id","date"),
	CONSTRAINT "job_bay_calendar_exception_direction_check" CHECK ("job_bay_calendar_exception"."direction" IN ('work', 'off')),
	CONSTRAINT "job_bay_calendar_exception_label_nonempty" CHECK ("job_bay_calendar_exception"."label" IS NULL OR length(trim("job_bay_calendar_exception"."label")) > 0)
);
--> statement-breakpoint
ALTER TABLE "job_bay_calendar_exception" ADD CONSTRAINT "job_bay_calendar_exception_bay_id_job_bay_id_fk" FOREIGN KEY ("bay_id") REFERENCES "public"."job_bay"("id") ON DELETE cascade ON UPDATE no action;