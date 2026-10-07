CREATE TABLE "contracting"."service_record" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machine_id" uuid NOT NULL,
	"start_date" date NOT NULL,
	"end_date" date,
	"reading_at_service_hours" numeric(12, 2),
	"primary_mechanic_user_id" text,
	"notes" text,
	"next_service_due_hours_set" numeric(12, 2),
	"closed_at" timestamp with time zone,
	"closed_by_user_id" text,
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "service_record_closed_shape" CHECK (("contracting"."service_record"."closed_at" IS NULL AND "contracting"."service_record"."closed_by_user_id" IS NULL AND "contracting"."service_record"."next_service_due_hours_set" IS NULL) OR ("contracting"."service_record"."closed_at" IS NOT NULL AND "contracting"."service_record"."closed_by_user_id" IS NOT NULL AND "contracting"."service_record"."end_date" IS NOT NULL AND "contracting"."service_record"."reading_at_service_hours" IS NOT NULL AND "contracting"."service_record"."next_service_due_hours_set" IS NOT NULL)),
	CONSTRAINT "service_record_dates" CHECK ("contracting"."service_record"."end_date" IS NULL OR "contracting"."service_record"."end_date" >= "contracting"."service_record"."start_date")
);
--> statement-breakpoint
ALTER TABLE "contracting"."service_record" ADD CONSTRAINT "service_record_machine_id_machine_id_fk" FOREIGN KEY ("machine_id") REFERENCES "contracting"."machine"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."service_record" ADD CONSTRAINT "service_record_primary_mechanic_user_id_user_id_fk" FOREIGN KEY ("primary_mechanic_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."service_record" ADD CONSTRAINT "service_record_closed_by_user_id_user_id_fk" FOREIGN KEY ("closed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."service_record" ADD CONSTRAINT "service_record_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "service_record_machine_idx" ON "contracting"."service_record" USING btree ("machine_id","start_date");