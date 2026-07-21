CREATE TABLE "quote_work_item_parts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"work_item_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"quantity" integer DEFAULT 1 NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_work_item_parts_name_nonempty" CHECK (length(trim("quote_work_item_parts"."name")) > 0),
	CONSTRAINT "quote_work_item_parts_position_nonnegative" CHECK ("quote_work_item_parts"."position" >= 0),
	CONSTRAINT "quote_work_item_parts_quantity_positive" CHECK ("quote_work_item_parts"."quantity" >= 1),
	CONSTRAINT "quote_work_item_parts_unit_price_nonnegative" CHECK ("quote_work_item_parts"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "quote_work_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"name" text NOT NULL,
	"position" integer DEFAULT 0 NOT NULL,
	"hours" numeric(8, 2) DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_work_items_name_nonempty" CHECK (length(trim("quote_work_items"."name")) > 0),
	CONSTRAINT "quote_work_items_position_nonnegative" CHECK ("quote_work_items"."position" >= 0),
	CONSTRAINT "quote_work_items_hours_nonnegative" CHECK ("quote_work_items"."hours" >= 0)
);
--> statement-breakpoint
ALTER TABLE "quote_work_item_parts" ADD CONSTRAINT "quote_work_item_parts_work_item_id_quote_work_items_id_fk" FOREIGN KEY ("work_item_id") REFERENCES "public"."quote_work_items"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_work_items" ADD CONSTRAINT "quote_work_items_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
DELETE FROM "quote_line_items" WHERE "quote_id" IN (SELECT "id" FROM "quote" WHERE "kind" = 'custom');
