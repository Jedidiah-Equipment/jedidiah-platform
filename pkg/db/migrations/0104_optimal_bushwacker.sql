CREATE SEQUENCE "public"."purchase_order_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "purchase_order_job_link" (
	"job_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	CONSTRAINT "purchase_order_job_link_pkey" PRIMARY KEY("purchase_order_id","job_id")
);
--> statement-breakpoint
CREATE TABLE "purchase_order_line" (
	"part_id" uuid NOT NULL,
	"purchase_order_id" uuid NOT NULL,
	"quantity" numeric(14, 3) NOT NULL,
	"unit_price" numeric(12, 2) NOT NULL,
	CONSTRAINT "purchase_order_line_pkey" PRIMARY KEY("purchase_order_id","part_id"),
	CONSTRAINT "purchase_order_line_quantity_positive" CHECK ("purchase_order_line"."quantity" > 0),
	CONSTRAINT "purchase_order_line_unit_price_nonnegative" CHECK ("purchase_order_line"."unit_price" >= 0)
);
--> statement-breakpoint
CREATE TABLE "purchase_order" (
	"code" integer DEFAULT nextval('purchase_order_code_seq'::regclass) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expected_delivery_date" date,
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sent_at" timestamp with time zone,
	"status" text DEFAULT 'draft' NOT NULL,
	"supplier_id" uuid NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "purchase_order_code_positive" CHECK ("purchase_order"."code" > 0),
	CONSTRAINT "purchase_order_status_check" CHECK ("purchase_order"."status" IN ('draft', 'sent', 'cancelled')),
	CONSTRAINT "purchase_order_sent_at_shape" CHECK (("purchase_order"."status" = 'draft' AND "purchase_order"."sent_at" IS NULL) OR ("purchase_order"."status" = 'sent' AND "purchase_order"."sent_at" IS NOT NULL) OR "purchase_order"."status" = 'cancelled')
);
--> statement-breakpoint
ALTER TABLE "documents" DROP CONSTRAINT "documents_exactly_one_owner";--> statement-breakpoint
ALTER TABLE "stock_movement" DROP CONSTRAINT "stock_movement_shape";--> statement-breakpoint
ALTER TABLE "documents" ADD COLUMN "purchase_order_id" uuid;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD COLUMN "purchase_order_id" uuid;--> statement-breakpoint
ALTER TABLE "purchase_order_job_link" ADD CONSTRAINT "purchase_order_job_link_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_job_link" ADD CONSTRAINT "purchase_order_job_link_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_part_id_parts_id_fk" FOREIGN KEY ("part_id") REFERENCES "public"."parts"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order_line" ADD CONSTRAINT "purchase_order_line_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_order" ADD CONSTRAINT "purchase_order_supplier_id_supplier_id_fk" FOREIGN KEY ("supplier_id") REFERENCES "public"."supplier"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "purchase_order_job_link_job_id_idx" ON "purchase_order_job_link" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "purchase_order_supplier_id_idx" ON "purchase_order" USING btree ("supplier_id");--> statement-breakpoint
CREATE UNIQUE INDEX "purchase_order_code_unique" ON "purchase_order" USING btree ("code");--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_purchase_order_id_purchase_order_id_fk" FOREIGN KEY ("purchase_order_id") REFERENCES "public"."purchase_order"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_purchase_order_line_fk" FOREIGN KEY ("purchase_order_id","part_id") REFERENCES "public"."purchase_order_line"("purchase_order_id","part_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "documents_purchase_order_id_created_at_idx" ON "documents" USING btree ("purchase_order_id","created_at");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_purchase_order_id_filename_ci_unique" ON "documents" USING btree ("purchase_order_id",lower("filename"));--> statement-breakpoint
ALTER TABLE "documents" ADD CONSTRAINT "documents_exactly_one_owner" CHECK (("documents"."owner_type" = 'product' AND "documents"."product_id" IS NOT NULL AND "documents"."job_id" IS NULL AND "documents"."quote_id" IS NULL AND "documents"."purchase_order_id" IS NULL) OR ("documents"."owner_type" = 'job' AND "documents"."job_id" IS NOT NULL AND "documents"."product_id" IS NULL AND "documents"."quote_id" IS NULL AND "documents"."purchase_order_id" IS NULL) OR ("documents"."owner_type" = 'quote' AND "documents"."quote_id" IS NOT NULL AND "documents"."product_id" IS NULL AND "documents"."job_id" IS NULL AND "documents"."purchase_order_id" IS NULL) OR ("documents"."owner_type" = 'purchase_order' AND "documents"."purchase_order_id" IS NOT NULL AND "documents"."product_id" IS NULL AND "documents"."job_id" IS NULL AND "documents"."quote_id" IS NULL));--> statement-breakpoint
ALTER TABLE "stock_movement" ADD CONSTRAINT "stock_movement_shape" CHECK ((
        "stock_movement"."movement_type" = 'adjustment'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."reason" IS NOT NULL
        AND ("stock_movement"."reason" = 'opening-balance' OR "stock_movement"."note" IS NOT NULL)
        AND ("stock_movement"."unit_cost" IS NULL OR "stock_movement"."reason" = 'opening-balance')
      ) OR (
        "stock_movement"."movement_type" = 'revaluation'
        AND "stock_movement"."job_id" IS NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."delta" = 0
        AND "stock_movement"."unit_cost" IS NOT NULL
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'checkout'
        AND "stock_movement"."job_id" IS NOT NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."delta" < 0
        AND "stock_movement"."reason" IS NULL
      ) OR (
        "stock_movement"."movement_type" = 'return-to-store'
        AND "stock_movement"."job_id" IS NOT NULL
        AND "stock_movement"."purchase_order_id" IS NULL
        AND "stock_movement"."delta" > 0
        AND "stock_movement"."reason" IS NULL
      ));
