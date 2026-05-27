CREATE TABLE "assembly_overrides" (
	"optional_assembly_id" uuid NOT NULL,
	"optional_kind" text GENERATED ALWAYS AS ('optional') STORED NOT NULL,
	"product_id" uuid NOT NULL,
	"standard_assembly_id" uuid NOT NULL,
	"standard_kind" text GENERATED ALWAYS AS ('standard') STORED NOT NULL,
	CONSTRAINT "assembly_overrides_pkey" PRIMARY KEY("optional_assembly_id","standard_assembly_id")
);
--> statement-breakpoint
CREATE TABLE "assembly_parts" (
	"assembly_id" uuid NOT NULL,
	"part_id" uuid NOT NULL,
	"quantity" integer NOT NULL,
	CONSTRAINT "assembly_parts_pkey" PRIMARY KEY("assembly_id","part_id"),
	CONSTRAINT "assembly_parts_quantity_positive" CHECK ("assembly_parts"."quantity" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_assemblies" (
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"price" numeric(12, 2),
	"product_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_assemblies_kind_check" CHECK ("product_assemblies"."kind" IN ('standard', 'optional')),
	CONSTRAINT "product_assemblies_name_nonempty" CHECK (length(trim("product_assemblies"."name")) > 0),
	CONSTRAINT "product_assemblies_price_kind_check" CHECK (("product_assemblies"."kind" = 'standard' AND "product_assemblies"."price" IS NULL) OR ("product_assemblies"."kind" = 'optional' AND "product_assemblies"."price" IS NOT NULL AND "product_assemblies"."price" >= 0))
);
--> statement-breakpoint
CREATE UNIQUE INDEX "product_assemblies_product_id_name_unique" ON "product_assemblies" USING btree ("product_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "product_assemblies_id_product_id_kind_unique" ON "product_assemblies" USING btree ("id","product_id","kind");--> statement-breakpoint
ALTER TABLE "assembly_overrides" ADD CONSTRAINT "assembly_overrides_optional_fk" FOREIGN KEY ("optional_assembly_id","product_id","optional_kind") REFERENCES "public"."product_assemblies"("id","product_id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_overrides" ADD CONSTRAINT "assembly_overrides_standard_fk" FOREIGN KEY ("standard_assembly_id","product_id","standard_kind") REFERENCES "public"."product_assemblies"("id","product_id","kind") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_parts" ADD CONSTRAINT "assembly_parts_assembly_id_product_assemblies_id_fk" FOREIGN KEY ("assembly_id") REFERENCES "public"."product_assemblies"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "assembly_parts" ADD CONSTRAINT "assembly_parts_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_assemblies" ADD CONSTRAINT "product_assemblies_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;
