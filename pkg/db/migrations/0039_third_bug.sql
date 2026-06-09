CREATE TABLE "product_bay" (
	"product_id" uuid NOT NULL,
	"bay_id" uuid NOT NULL,
	"default_working_days" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "product_bay_pkey" PRIMARY KEY("product_id","bay_id"),
	CONSTRAINT "product_bay_default_working_days_positive" CHECK ("product_bay"."default_working_days" > 0)
);
--> statement-breakpoint
ALTER TABLE "product_bay" ADD CONSTRAINT "product_bay_product_id_products_id_fk" FOREIGN KEY ("product_id") REFERENCES "public"."products"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "product_bay" ADD CONSTRAINT "product_bay_bay_id_job_bay_id_fk" FOREIGN KEY ("bay_id") REFERENCES "public"."job_bay"("id") ON DELETE restrict ON UPDATE no action;