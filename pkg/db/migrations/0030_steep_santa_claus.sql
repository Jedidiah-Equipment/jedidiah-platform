CREATE TABLE "job_bay" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department" text NOT NULL,
	"name" text NOT NULL,
	"schedule_origin" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_bay_department_check" CHECK ("job_bay"."department" IN ('procurement', 'supply', 'fabrication', 'paint', 'assembly')),
	CONSTRAINT "job_bay_name_nonempty" CHECK (length(trim("job_bay"."name")) > 0)
);
