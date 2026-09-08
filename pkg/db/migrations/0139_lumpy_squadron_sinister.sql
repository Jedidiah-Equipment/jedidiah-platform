CREATE TABLE "contracting"."farm" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"customer_id" uuid NOT NULL,
	"name" text NOT NULL,
	CONSTRAINT "farm_name_not_blank" CHECK (length(btrim("contracting"."farm"."name")) > 0)
);
--> statement-breakpoint
ALTER TABLE "contracting"."farm" ADD CONSTRAINT "farm_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "contracting"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "farm_customer_name_ci_unique" ON "contracting"."farm" USING btree ("customer_id",lower("name"));