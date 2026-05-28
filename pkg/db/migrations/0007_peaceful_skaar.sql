ALTER TABLE "quote" DROP CONSTRAINT "quote_sales_person_id_user_id_fk";
--> statement-breakpoint
ALTER TABLE "quote" ALTER COLUMN "product_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ALTER COLUMN "sales_person_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ALTER COLUMN "quoted_base_price" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ALTER COLUMN "quoted_currency_code" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_sales_person_id_user_id_fk" FOREIGN KEY ("sales_person_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "quote" DROP CONSTRAINT "quote_discount_not_above_snapshot";--> statement-breakpoint
ALTER TABLE "quote" ADD CONSTRAINT "quote_discount_not_above_snapshot" CHECK ("quote"."discount" <= "quote"."quoted_base_price");--> statement-breakpoint
ALTER TABLE "quote" DROP COLUMN "sent_at";
