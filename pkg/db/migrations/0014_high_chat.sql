CREATE SEQUENCE "public"."quote_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "quote" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" integer DEFAULT nextval('quote_code_seq'::regclass) NOT NULL,
	"customer_id" uuid NOT NULL,
	"product_id" uuid NOT NULL,
	"sales_person_id" text,
	"status" text DEFAULT 'draft' NOT NULL,
	"discount" numeric(12, 2) DEFAULT 0 NOT NULL,
	"valid_until" date,
	"notes" text,
	"quoted_base_price" numeric(12, 2),
	"quoted_currency_code" text,
	"sent_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "quote_discount_nonnegative" CHECK ("quote"."discount" >= 0),
	CONSTRAINT "quote_discount_not_above_snapshot" CHECK ("quote"."quoted_base_price" is null or "quote"."discount" <= "quote"."quoted_base_price")
);
--> statement-breakpoint
ALTER TABLE "customers" ALTER COLUMN "email" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "quote_id" uuid;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "due_date" date;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_customer_id_customers_id_fk" FOREIGN KEY ("customer_id") REFERENCES "public"."customers"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_sales_person_id_user_id_fk" FOREIGN KEY ("sales_person_id") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "quote_code_unique" ON "quote" USING btree ("code");--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_quote_id_unique" ON "job" USING btree ("quote_id");
