CREATE TABLE "bay" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"department" text NOT NULL,
	"name" text NOT NULL,
	"schedule_origin" timestamp with time zone DEFAULT now() NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bay_department_check" CHECK ("bay"."department" IN ('procurement', 'supply', 'fabrication', 'paint', 'assembly')),
	CONSTRAINT "bay_name_nonempty" CHECK (length(trim("bay"."name")) > 0)
);
