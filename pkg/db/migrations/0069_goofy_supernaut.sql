CREATE TABLE "product_range_variants" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"range_id" uuid NOT NULL,
	"name" text NOT NULL,
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_range_variants_name_nonempty" CHECK (length(trim("product_range_variants"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "product_range_variants" ADD CONSTRAINT "product_range_variants_range_id_product_ranges_id_fk" FOREIGN KEY ("range_id") REFERENCES "public"."product_ranges"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_range_variants_range_name_ci_unique" ON "product_range_variants" USING btree ("range_id",lower("name")) WHERE "product_range_variants"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "product_range_variants_id_range_id_unique" ON "product_range_variants" USING btree ("id","range_id");