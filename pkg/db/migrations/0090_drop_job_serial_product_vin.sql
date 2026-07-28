ALTER TABLE "job" DROP CONSTRAINT "job_product_serial_prefix_nonempty";--> statement-breakpoint
ALTER TABLE "job" DROP CONSTRAINT "job_product_serial_year_range";--> statement-breakpoint
ALTER TABLE "job" DROP CONSTRAINT "job_product_serial_sequence_positive";--> statement-breakpoint
ALTER TABLE "job" DROP CONSTRAINT "job_product_serial_number_nonempty";--> statement-breakpoint
ALTER TABLE "job" DROP CONSTRAINT "job_product_serial_shape";--> statement-breakpoint
ALTER TABLE "job" DROP CONSTRAINT "job_product_id_products_id_fk";
--> statement-breakpoint
DROP INDEX "job_product_serial_number_unique";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "product_id";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "product_serial_prefix";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "product_serial_year";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "product_serial_sequence";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "product_serial_number";--> statement-breakpoint
ALTER TABLE "job" DROP COLUMN "vin_number";