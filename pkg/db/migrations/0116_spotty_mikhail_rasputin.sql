CREATE TABLE "product_labor_hours" (
	"department" text NOT NULL,
	"hours" numeric(6, 2) NOT NULL,
	"product_id" uuid NOT NULL,
	CONSTRAINT "product_labor_hours_pkey" PRIMARY KEY("product_id","department"),
	CONSTRAINT "product_labor_hours_department_check" CHECK ("product_labor_hours"."department" IN ('fabrication', 'paint', 'assembly', 'workshop')),
	CONSTRAINT "product_labor_hours_hours_positive" CHECK ("product_labor_hours"."hours" > 0)
);
--> statement-breakpoint
CREATE TABLE "product_material_line" (
	"part_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"quantity_per_unit" numeric(14, 3) NOT NULL,
	CONSTRAINT "product_material_line_pkey" PRIMARY KEY("product_id","part_id"),
	CONSTRAINT "product_material_line_quantity_per_unit_positive" CHECK ("product_material_line"."quantity_per_unit" > 0)
);
--> statement-breakpoint
ALTER TABLE "product_labor_hours" ADD CONSTRAINT "product_labor_hours_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_material_line" ADD CONSTRAINT "product_material_line_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_material_line" ADD CONSTRAINT "product_material_line_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;