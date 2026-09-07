CREATE SCHEMA "contracting";
--> statement-breakpoint
CREATE TABLE "contracting"."category" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"preset_rate" numeric(12, 2) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "category_name_not_blank" CHECK (length(btrim("contracting"."category"."name")) > 0),
	CONSTRAINT "category_rate_nonnegative" CHECK ("contracting"."category"."preset_rate" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contracting"."implement" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"implement_type" text NOT NULL,
	"notes" text,
	"retired_at" timestamp with time zone,
	"retired_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "implement_code_uppercase" CHECK ("contracting"."implement"."code" = upper(btrim("contracting"."implement"."code")) AND length("contracting"."implement"."code") > 0),
	CONSTRAINT "implement_retirement_reason" CHECK (("contracting"."implement"."retired_at" IS NULL AND "contracting"."implement"."retired_reason" IS NULL) OR ("contracting"."implement"."retired_at" IS NOT NULL AND length(btrim("contracting"."implement"."retired_reason")) > 0 AND "contracting"."implement"."retired_reason" IS NOT NULL))
);
--> statement-breakpoint
CREATE TABLE "contracting"."machine" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" text NOT NULL,
	"make" text NOT NULL,
	"model" text NOT NULL,
	"year" integer,
	"registration" text,
	"category_id" uuid NOT NULL,
	"current_driver_user_id" text,
	"notes" text,
	"service_interval_hours" numeric(12, 2),
	"next_service_due_hours" numeric(12, 2),
	"retired_at" timestamp with time zone,
	"retired_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machine_code_uppercase" CHECK ("contracting"."machine"."code" = upper(btrim("contracting"."machine"."code")) AND length("contracting"."machine"."code") > 0),
	CONSTRAINT "machine_retirement_reason" CHECK (("contracting"."machine"."retired_at" IS NULL AND "contracting"."machine"."retired_reason" IS NULL) OR ("contracting"."machine"."retired_at" IS NOT NULL AND length(btrim("contracting"."machine"."retired_reason")) > 0 AND "contracting"."machine"."retired_reason" IS NOT NULL)),
	CONSTRAINT "machine_service_interval_positive" CHECK ("contracting"."machine"."service_interval_hours" > 0),
	CONSTRAINT "machine_service_due_nonnegative" CHECK ("contracting"."machine"."next_service_due_hours" >= 0)
);
--> statement-breakpoint
ALTER TABLE "contracting"."machine" ADD CONSTRAINT "machine_category_id_category_id_fk" FOREIGN KEY ("category_id") REFERENCES "contracting"."category"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."machine" ADD CONSTRAINT "machine_current_driver_user_id_user_id_fk" FOREIGN KEY ("current_driver_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "category_name_ci_unique" ON "contracting"."category" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "implement_code_ci_unique" ON "contracting"."implement" USING btree (lower("code"));--> statement-breakpoint
CREATE UNIQUE INDEX "machine_code_ci_unique" ON "contracting"."machine" USING btree (lower("code"));--> statement-breakpoint
CREATE INDEX "machine_category_idx" ON "contracting"."machine" USING btree ("category_id");--> statement-breakpoint
CREATE INDEX "machine_driver_idx" ON "contracting"."machine" USING btree ("current_driver_user_id");