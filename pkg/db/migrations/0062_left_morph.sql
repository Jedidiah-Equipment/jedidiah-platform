CREATE TABLE "quote_line_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"name" text NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_line_items_name_nonempty" CHECK (length(trim("quote_line_items"."name")) > 0),
	CONSTRAINT "quote_line_items_quantity_positive" CHECK ("quote_line_items"."quantity" >= 1),
	CONSTRAINT "quote_line_items_unit_price_nonnegative" CHECK ("quote_line_items"."unit_price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "quote_line_items" ADD CONSTRAINT "quote_line_items_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE cascade ON UPDATE no action;