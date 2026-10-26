CREATE TABLE "contracting"."john_deere_link" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machine_id" uuid NOT NULL,
	"equipment_id" text NOT NULL,
	"principal_id" integer NOT NULL,
	"organization_id" text NOT NULL,
	"serial_number" text,
	"deere_name" text NOT NULL,
	"deere_make" text,
	"deere_model" text,
	"deere_model_year" text,
	"linked_by_user_id" text NOT NULL,
	"linked_at" timestamp with time zone NOT NULL,
	"unlinked_by_user_id" text,
	"unlinked_at" timestamp with time zone,
	"lost_at" timestamp with time zone,
	"last_polled_at" timestamp with time zone,
	"last_report_time" timestamp with time zone,
	"last_value" numeric(10, 1),
	"last_error" text,
	"last_error_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "john_deere_link_unlinked_shape" CHECK (("contracting"."john_deere_link"."unlinked_at" IS NULL) = ("contracting"."john_deere_link"."unlinked_by_user_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "contracting"."machine" ADD COLUMN "serial_number" text;--> statement-breakpoint
ALTER TABLE "contracting"."john_deere_link" ADD CONSTRAINT "john_deere_link_machine_id_machine_id_fk" FOREIGN KEY ("machine_id") REFERENCES "contracting"."machine"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."john_deere_link" ADD CONSTRAINT "john_deere_link_linked_by_user_id_user_id_fk" FOREIGN KEY ("linked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."john_deere_link" ADD CONSTRAINT "john_deere_link_unlinked_by_user_id_user_id_fk" FOREIGN KEY ("unlinked_by_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "john_deere_link_active_machine_unique" ON "contracting"."john_deere_link" USING btree ("machine_id") WHERE "contracting"."john_deere_link"."unlinked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "john_deere_link_active_equipment_unique" ON "contracting"."john_deere_link" USING btree ("equipment_id") WHERE "contracting"."john_deere_link"."unlinked_at" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "machine_serial_number_ci_unique" ON "contracting"."machine" USING btree (lower("serial_number")) WHERE "contracting"."machine"."serial_number" IS NOT NULL;