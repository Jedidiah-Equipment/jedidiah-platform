CREATE TABLE "product_ranges" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"image_data_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_ranges_name_nonempty" CHECK (length(trim("product_ranges"."name")) > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "product_ranges_name_ci_unique" ON "product_ranges" USING btree (lower("name"));