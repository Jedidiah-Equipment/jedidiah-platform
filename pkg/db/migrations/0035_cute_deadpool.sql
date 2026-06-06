CREATE TABLE "working_calendar_off_day" (
	"date" date PRIMARY KEY NOT NULL,
	"label" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "working_calendar_off_day_label_nonempty" CHECK ("working_calendar_off_day"."label" IS NULL OR length(trim("working_calendar_off_day"."label")) > 0)
);
