CREATE TABLE "contracting"."measure_type" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measure_type_name_not_blank" CHECK (length(btrim("contracting"."measure_type"."name")) > 0)
);
--> statement-breakpoint
CREATE TABLE "contracting"."rate" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"basis" text NOT NULL,
	"measure_type_id" uuid,
	"amount" numeric(12, 2) NOT NULL,
	"display_order" integer NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "rate_name_not_blank" CHECK (length(btrim("contracting"."rate"."name")) > 0),
	CONSTRAINT "rate_basis" CHECK ("contracting"."rate"."basis" IN ('time', 'measure')),
	CONSTRAINT "rate_basis_measure_type" CHECK (("contracting"."rate"."basis" = 'time' AND "contracting"."rate"."measure_type_id" IS NULL) OR ("contracting"."rate"."basis" = 'measure' AND "contracting"."rate"."measure_type_id" IS NOT NULL)),
	CONSTRAINT "rate_amount_positive" CHECK ("contracting"."rate"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "contracting"."rate" ADD CONSTRAINT "rate_measure_type_id_measure_type_id_fk" FOREIGN KEY ("measure_type_id") REFERENCES "contracting"."measure_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "measure_type_name_ci_unique" ON "contracting"."measure_type" USING btree (lower("name"));--> statement-breakpoint
CREATE UNIQUE INDEX "rate_name_ci_unique" ON "contracting"."rate" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "rate_measure_type_idx" ON "contracting"."rate" USING btree ("measure_type_id");