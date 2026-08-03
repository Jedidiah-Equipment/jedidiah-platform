CREATE TABLE "part_bom" (
	"component_part_id" uuid NOT NULL,
	"parent_part_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	CONSTRAINT "part_bom_pkey" PRIMARY KEY("parent_part_id","component_part_id"),
	CONSTRAINT "part_bom_quantity_positive" CHECK ("part_bom"."quantity" > 0),
	CONSTRAINT "part_bom_no_self_reference" CHECK ("part_bom"."parent_part_id" <> "part_bom"."component_part_id")
);
--> statement-breakpoint
CREATE TABLE "stock_build" (
	"actor_user_id" text NOT NULL,
	"built_part_id" uuid NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	CONSTRAINT "stock_build_quantity_positive" CHECK ("stock_build"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_type_check";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_shape";--> statement-breakpoint
ALTER TABLE "parts" ALTER COLUMN "supplier_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD COLUMN "build_id" uuid;--> statement-breakpoint
ALTER TABLE "part_bom" ADD CONSTRAINT "part_bom_component_part_id_parts_id_fk" FOREIGN KEY ("component_part_id") REFERENCES "public"."parts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "part_bom" ADD CONSTRAINT "part_bom_parent_part_id_parts_id_fk" FOREIGN KEY ("parent_part_id") REFERENCES "public"."parts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_build" ADD CONSTRAINT "stock_build_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_build" ADD CONSTRAINT "stock_build_built_part_id_parts_id_fk" FOREIGN KEY ("built_part_id") REFERENCES "public"."parts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "part_bom_component_part_id_idx" ON "part_bom" USING btree ("component_part_id");--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_build_id_stock_build_id_fk" FOREIGN KEY ("build_id") REFERENCES "public"."stock_build"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "stock_movement_build_idx" ON "stock_movement" USING btree ("build_id");--> statement-breakpoint
-- Data migration: the XOR check below cannot be added until existing rows satisfy it.
-- A Built Part is made in-house and bought from nobody, so the fabricated flag now forces a null
-- Supplier. Most of these pointed at the "Jedidiah Fabrication" placeholder, but NOT all — some sat
-- on real suppliers that still trade with us, so the predicate is the flag, never the supplier id.
UPDATE "parts" SET "supplier_id" = NULL WHERE "is_internally_fabricated";--> statement-breakpoint
-- The placeholder itself now holds no parts and has no reason to exist. Soft-deleted through the
-- usual convention rather than dropped: audit rows still reference it. Guarded on having no parts
-- left so a re-run, or an environment that reused the name for a real supplier, is a no-op.
UPDATE "supplier" SET "deleted_at" = now(), "updated_at" = now()
  WHERE "company_name" = 'Jedidiah Fabrication'
    AND "deleted_at" IS NULL
    AND NOT EXISTS (SELECT 1 FROM "parts" WHERE "parts"."supplier_id" = "supplier"."id");--> statement-breakpoint
ALTER TABLE "parts" ADD CONSTRAINT "parts_supplier_or_bom" CHECK (("parts"."is_internally_fabricated" AND "parts"."supplier_id" IS NULL) OR (NOT "parts"."is_internally_fabricated" AND "parts"."supplier_id" IS NOT NULL));--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_type_check" CHECK ("stock_movement"."movement_type" IN ('adjustment', 'revaluation', 'checkout', 'return-to-store', 'receipt', 'build-consume', 'build-produce'));--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_shape" CHECK ((
        "stock_movement"."movement_type" = 'adjustment'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."reason" IS NOT NULL
        AND ("stock_movement"."reason" = 'opening-balance' OR "stock_movement"."note" IS NOT NULL)
        AND ("stock_movement"."unit_cost" IS NULL OR "stock_movement"."reason" = 'opening-balance')
      ) OR (
        "stock_movement"."movement_type" = 'revaluation'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."delta" = 0
        AND "stock_movement"."unit_cost" IS NOT NULL
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'checkout'
        AND "stock_movement"."job_id" IS NOT NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."delta" < 0
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'return-to-store'
        AND "stock_movement"."job_id" IS NOT NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."delta" > 0
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'receipt'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NOT NULL
        AND "stock_movement"."build_id" IS NULL
        AND "stock_movement"."delta" > 0
        AND "stock_movement"."reason" IS NULL
        AND "stock_movement"."unit_cost" IS NOT NULL
      ) OR (
        "stock_movement"."movement_type" = 'build-consume'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NOT NULL
        AND "stock_movement"."delta" < 0
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'build-produce'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."build_id" IS NOT NULL
        AND "stock_movement"."delta" > 0
        AND "stock_movement"."reason" IS NULL
      ));