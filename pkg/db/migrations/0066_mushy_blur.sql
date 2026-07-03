ALTER TABLE "job" ALTER COLUMN "product_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ALTER COLUMN "product_serial_prefix" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ALTER COLUMN "product_serial_year" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ALTER COLUMN "product_serial_sequence" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ALTER COLUMN "product_serial_number" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "job" ADD CONSTRAINT "job_product_serial_shape" CHECK (("job"."product_id" is not null
            and "job"."product_serial_number" is not null
            and "job"."product_serial_prefix" is not null
            and "job"."product_serial_year" is not null
            and "job"."product_serial_sequence" is not null)
        or ("job"."product_id" is null
            and "job"."product_serial_number" is null
            and "job"."product_serial_prefix" is null
            and "job"."product_serial_year" is null
            and "job"."product_serial_sequence" is null));