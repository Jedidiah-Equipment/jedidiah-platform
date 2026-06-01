DELETE FROM "job";--> statement-breakpoint
CREATE TABLE "product_serial_sequence" (
	"product_id" uuid PRIMARY KEY NOT NULL,
	"last_sequence" integer NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_serial_sequence_last_sequence_positive" CHECK ("product_serial_sequence"."last_sequence" > 0)
);
--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "product_serial_prefix" text NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "product_serial_year" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "product_serial_sequence" integer NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD COLUMN "product_serial_number" text NOT NULL;--> statement-breakpoint
ALTER TABLE "product_serial_sequence" ADD CONSTRAINT "product_serial_sequence_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "job_product_serial_number_unique" ON "job" USING btree ("product_serial_number");--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_product_serial_prefix_nonempty" CHECK (length(trim("job"."product_serial_prefix")) > 0);--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_product_serial_year_range" CHECK ("job"."product_serial_year" >= 0 AND "job"."product_serial_year" <= 99);--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_product_serial_sequence_positive" CHECK ("job"."product_serial_sequence" > 0);--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_product_serial_number_nonempty" CHECK (length(trim("job"."product_serial_number")) > 0);
