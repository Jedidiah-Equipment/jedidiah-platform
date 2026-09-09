CREATE TABLE "equipment"."labor_department_rate" (
	"department" text PRIMARY KEY NOT NULL,
	"cost_to_company_rate" numeric,
	"billing_rate" numeric,
	"consumables_percentage" numeric,
	CONSTRAINT "labor_department_rate_department" CHECK ("equipment"."labor_department_rate"."department" in ('fabrication', 'supply', 'paint', 'assembly', 'workshop')),
	CONSTRAINT "labor_department_rate_cost_nonnegative" CHECK ("equipment"."labor_department_rate"."cost_to_company_rate" >= 0),
	CONSTRAINT "labor_department_rate_billing_nonnegative" CHECK ("equipment"."labor_department_rate"."billing_rate" >= 0),
	CONSTRAINT "labor_department_rate_consumables_nonnegative" CHECK ("equipment"."labor_department_rate"."consumables_percentage" >= 0)
);
--> statement-breakpoint
CREATE TABLE "equipment"."labor_rate_settings" (
	"id" text PRIMARY KEY DEFAULT 'labor-rate-card' NOT NULL,
	"management_overhead_percentage" numeric NOT NULL,
	"hours_per_working_day" numeric NOT NULL,
	CONSTRAINT "labor_rate_settings_singleton" CHECK ("equipment"."labor_rate_settings"."id" = 'labor-rate-card'),
	CONSTRAINT "labor_rate_settings_management_nonnegative" CHECK ("equipment"."labor_rate_settings"."management_overhead_percentage" >= 0),
	CONSTRAINT "labor_rate_settings_hours_bounds" CHECK ("equipment"."labor_rate_settings"."hours_per_working_day" between 1 and 24)
);
--> statement-breakpoint
INSERT INTO "equipment"."labor_department_rate" ("department", "cost_to_company_rate", "billing_rate", "consumables_percentage") VALUES
  ('fabrication', 220, 550, 60),
  ('supply', 200, NULL, 60),
  ('paint', 65, 375, 40),
  ('assembly', 80, 320, 20),
  ('workshop', NULL, 320, NULL);
--> statement-breakpoint
INSERT INTO "equipment"."labor_rate_settings" ("id", "management_overhead_percentage", "hours_per_working_day") VALUES ('labor-rate-card', 50, 9);
