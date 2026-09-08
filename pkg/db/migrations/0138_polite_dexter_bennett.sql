CREATE TABLE "contracting"."customer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"contact_name" text,
	"phone" text,
	"email" text,
	"notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "customer_name_not_blank" CHECK (length(btrim("contracting"."customer"."name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "customer_name_ci_unique" ON "contracting"."customer" USING btree (lower("name"));