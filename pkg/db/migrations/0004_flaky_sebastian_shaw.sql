ALTER TABLE "supplier" RENAME COLUMN "name" TO "company_name";--> statement-breakpoint
ALTER INDEX "supplier_name_unique" RENAME TO "supplier_company_name_unique";--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "email" text;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "address" text;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "contact_person" text;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "phone" text;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "notes" text;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "created_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "supplier" ADD COLUMN "updated_at" timestamp with time zone DEFAULT now() NOT NULL;
