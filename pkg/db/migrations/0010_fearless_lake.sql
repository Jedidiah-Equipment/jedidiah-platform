CREATE TABLE "quote_selected_assemblies" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"quote_id" uuid NOT NULL,
	"product_assembly_id" uuid,
	"quoted_name" text NOT NULL,
	"quoted_price" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_selected_assemblies_name_nonempty" CHECK (length(trim("quote_selected_assemblies"."quoted_name")) > 0),
	CONSTRAINT "quote_selected_assemblies_price_nonnegative" CHECK ("quote_selected_assemblies"."quoted_price" >= 0)
);
--> statement-breakpoint
ALTER TABLE "quote_selected_assemblies" ADD CONSTRAINT "quote_selected_assemblies_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote_selected_assemblies" ADD CONSTRAINT "quote_selected_assemblies_product_assembly_id_product_assemblies_id_fk" FOREIGN KEY ("product_assembly_id") REFERENCES "public"."product_assemblies"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quote_selected_assemblies_quote_product_assembly_unique" ON "quote_selected_assemblies" USING btree ("quote_id","product_assembly_id");