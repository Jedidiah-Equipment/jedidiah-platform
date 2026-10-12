CREATE TABLE "contracting"."settings" (
	"id" text PRIMARY KEY DEFAULT 'contracting' NOT NULL,
	"gap_flag_threshold_hours" numeric(10, 1) DEFAULT 4 NOT NULL,
	"service_due_soon_threshold_hours" integer DEFAULT 100 NOT NULL,
	"utilisation_target_percent" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "settings_singleton" CHECK ("contracting"."settings"."id" = 'contracting'),
	CONSTRAINT "settings_gap_flag_threshold_bounds" CHECK ("contracting"."settings"."gap_flag_threshold_hours" between 0.5 and 48),
	CONSTRAINT "settings_service_due_soon_threshold_bounds" CHECK ("contracting"."settings"."service_due_soon_threshold_hours" between 0 and 1000),
	CONSTRAINT "settings_utilisation_target_bounds" CHECK ("contracting"."settings"."utilisation_target_percent" is null or "contracting"."settings"."utilisation_target_percent" between 1 and 100)
);
--> statement-breakpoint
INSERT INTO "contracting"."settings" ("id") VALUES ('contracting');
