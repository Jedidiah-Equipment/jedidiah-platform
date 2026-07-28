CREATE TABLE "product_unit_ownership_transfer" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_unit_id" uuid NOT NULL,
	"from_customer_id" uuid,
	"to_customer_id" uuid,
	"occurred_on" date NOT NULL,
	"source_quote_id" uuid,
	"actor_user_id" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_unit_ownership_transfer_moves_owner" CHECK ("product_unit_ownership_transfer"."from_customer_id" IS DISTINCT FROM "product_unit_ownership_transfer"."to_customer_id"),
	CONSTRAINT "product_unit_ownership_transfer_note_nonempty" CHECK ("product_unit_ownership_transfer"."note" IS NULL OR length(trim("product_unit_ownership_transfer"."note")) > 0)
);
--> statement-breakpoint
CREATE TABLE "product_unit" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"product_id" uuid NOT NULL,
	"product_serial_prefix" text NOT NULL,
	"product_serial_year" integer NOT NULL,
	"product_serial_sequence" integer NOT NULL,
	"product_serial_number" text NOT NULL,
	"vin_number" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_unit_serial_prefix_nonempty" CHECK (length(trim("product_unit"."product_serial_prefix")) > 0),
	CONSTRAINT "product_unit_serial_year_range" CHECK ("product_unit"."product_serial_year" >= 0 AND "product_unit"."product_serial_year" <= 99),
	CONSTRAINT "product_unit_serial_sequence_positive" CHECK ("product_unit"."product_serial_sequence" > 0),
	CONSTRAINT "product_unit_serial_number_nonempty" CHECK (length(trim("product_unit"."product_serial_number")) > 0),
	CONSTRAINT "product_unit_vin_number_nonempty" CHECK ("product_unit"."vin_number" IS NULL OR length(trim("product_unit"."vin_number")) > 0)
);
--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "product_unit_id" uuid;--> statement-breakpoint
ALTER TABLE "product_unit_ownership_transfer" ADD CONSTRAINT "product_unit_ownership_transfer_product_unit_id_product_unit_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_unit"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_unit_ownership_transfer" ADD CONSTRAINT "product_unit_ownership_transfer_from_customer_id_customers_id_fk" FOREIGN KEY ("from_customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_unit_ownership_transfer" ADD CONSTRAINT "product_unit_ownership_transfer_to_customer_id_customers_id_fk" FOREIGN KEY ("to_customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_unit_ownership_transfer" ADD CONSTRAINT "product_unit_ownership_transfer_source_quote_id_quote_id_fk" FOREIGN KEY ("source_quote_id") REFERENCES "public"."quote"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_unit_ownership_transfer" ADD CONSTRAINT "product_unit_ownership_transfer_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_unit" ADD CONSTRAINT "product_unit_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "product_unit_ownership_transfer_unit_recency_idx" ON "product_unit_ownership_transfer" USING btree ("product_unit_id","occurred_on","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "product_unit_serial_number_unique" ON "product_unit" USING btree ("product_serial_number");--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_product_unit_id_product_unit_id_fk" FOREIGN KEY ("product_unit_id") REFERENCES "public"."product_unit"("id") ON DELETE restrict ON UPDATE no action;