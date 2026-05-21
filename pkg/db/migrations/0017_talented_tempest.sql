CREATE TABLE "product_department_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"department" text NOT NULL,
	"duration_days" integer DEFAULT 0 NOT NULL,
	"default_station_ids" uuid[] DEFAULT '{}'::uuid[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_department_config_duration_days_nonnegative" CHECK ("product_department_config"."duration_days" >= 0)
);
--> statement-breakpoint
ALTER TABLE "product_department_config" ADD CONSTRAINT "product_department_config_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "product_department_config_product_id_department_unique" ON "product_department_config" USING btree ("product_id","department");