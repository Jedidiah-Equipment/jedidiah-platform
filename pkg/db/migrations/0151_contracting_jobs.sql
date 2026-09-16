CREATE SEQUENCE "contracting"."job_code_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1;--> statement-breakpoint
CREATE TABLE "contracting"."charge_line" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"description" text NOT NULL,
	"amount" numeric(12, 2),
	"display_order" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "charge_line_description_not_blank" CHECK (length(btrim("contracting"."charge_line"."description")) > 0),
	CONSTRAINT "charge_line_amount_nonnegative" CHECK ("contracting"."charge_line"."amount" IS NULL OR "contracting"."charge_line"."amount" >= 0)
);
--> statement-breakpoint
CREATE TABLE "contracting"."job" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"code" integer DEFAULT nextval('contracting.job_code_seq'::regclass) NOT NULL,
	"customer_id" uuid NOT NULL,
	"farm_id" uuid NOT NULL,
	"work_type_id" uuid NOT NULL,
	"description" text,
	"foreman_user_id" text,
	"status" text DEFAULT 'upcoming' NOT NULL,
	"start_date" date,
	"end_date" date,
	"notes" text,
	"diesel_litres" numeric(12, 2) DEFAULT 0 NOT NULL,
	"diesel_unit_price" numeric(12, 2),
	"diesel_amount" numeric(12, 2),
	"discount_kind" text,
	"discount_value" numeric(12, 2),
	"discount_amount" numeric(12, 2),
	"priced_subtotal" numeric(12, 2),
	"priced_total" numeric(12, 2),
	"completed_at" timestamp with time zone,
	"completed_by_user_id" text,
	"priced_at" timestamp with time zone,
	"priced_by_user_id" text,
	"invoice_number" text,
	"invoiced_at" timestamp with time zone,
	"invoiced_by_user_id" text,
	"cancelled_at" timestamp with time zone,
	"cancelled_by_user_id" text,
	"cancellation_reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "job_status" CHECK ("contracting"."job"."status" IN ('upcoming', 'active', 'completed', 'priced', 'invoiced', 'cancelled')),
	CONSTRAINT "job_completed_shape" CHECK (("contracting"."job"."status" IN ('upcoming', 'active', 'cancelled')) = ("contracting"."job"."completed_at" IS NULL) AND ("contracting"."job"."completed_at" IS NULL) = ("contracting"."job"."completed_by_user_id" IS NULL) AND ("contracting"."job"."completed_at" IS NULL OR ("contracting"."job"."start_date" IS NOT NULL AND "contracting"."job"."end_date" IS NOT NULL AND "contracting"."job"."start_date" <= "contracting"."job"."end_date"))),
	CONSTRAINT "job_priced_shape" CHECK (("contracting"."job"."status" IN ('priced', 'invoiced')) = ("contracting"."job"."priced_at" IS NOT NULL) AND ("contracting"."job"."priced_at" IS NULL) = ("contracting"."job"."priced_subtotal" IS NULL) AND ("contracting"."job"."priced_at" IS NULL) = ("contracting"."job"."priced_total" IS NULL) AND ("contracting"."job"."priced_at" IS NULL OR "contracting"."job"."diesel_litres" = 0 OR "contracting"."job"."diesel_amount" IS NOT NULL)),
	CONSTRAINT "job_invoiced_shape" CHECK (("contracting"."job"."status" = 'invoiced') = ("contracting"."job"."invoice_number" IS NOT NULL) AND ("contracting"."job"."invoice_number" IS NULL) = ("contracting"."job"."invoiced_at" IS NULL) AND ("contracting"."job"."invoice_number" IS NULL OR length(btrim("contracting"."job"."invoice_number")) > 0)),
	CONSTRAINT "job_cancelled_shape" CHECK (("contracting"."job"."status" = 'cancelled') = ("contracting"."job"."cancelled_at" IS NOT NULL) AND ("contracting"."job"."cancelled_at" IS NULL) = ("contracting"."job"."cancellation_reason" IS NULL) AND ("contracting"."job"."cancellation_reason" IS NULL OR length(btrim("contracting"."job"."cancellation_reason")) > 0)),
	CONSTRAINT "job_diesel_shape" CHECK ("contracting"."job"."diesel_litres" >= 0 AND ("contracting"."job"."diesel_unit_price" IS NULL OR "contracting"."job"."diesel_unit_price" >= 0) AND ("contracting"."job"."diesel_amount" IS NULL OR "contracting"."job"."diesel_amount" >= 0)),
	CONSTRAINT "job_discount_shape" CHECK (("contracting"."job"."discount_kind" IS NULL AND "contracting"."job"."discount_value" IS NULL AND "contracting"."job"."discount_amount" IS NULL) OR ("contracting"."job"."discount_kind" IN ('amount', 'percent') AND "contracting"."job"."discount_value" >= 0 AND ("contracting"."job"."discount_kind" <> 'percent' OR "contracting"."job"."discount_value" <= 100)))
);
--> statement-breakpoint
CREATE TABLE "contracting"."machine_assignment" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_id" uuid NOT NULL,
	"machine_id" uuid NOT NULL,
	"implement_id" uuid,
	"driver_user_id" text,
	"arrival_reading_id" uuid,
	"departure_reading_id" uuid,
	"travel_included" boolean DEFAULT true NOT NULL,
	"gap_travel_hours" numeric(10, 1),
	"gap_unaccounted_hours" numeric(10, 1),
	"gap_reason" text,
	"gap_resolved_at" timestamp with time zone,
	"gap_resolved_by_user_id" text,
	"rate_id" uuid,
	"rate_name" text,
	"rate_basis" text,
	"rate_measure_type_id" uuid,
	"rate_unit_amount" numeric(12, 2),
	"computed_amount" numeric(12, 2),
	"final_amount" numeric(12, 2),
	"created_by_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "machine_assignment_departure_needs_arrival" CHECK ("contracting"."machine_assignment"."departure_reading_id" IS NULL OR "contracting"."machine_assignment"."arrival_reading_id" IS NOT NULL),
	CONSTRAINT "machine_assignment_gap_shape" CHECK (("contracting"."machine_assignment"."gap_resolved_at" IS NULL AND "contracting"."machine_assignment"."gap_travel_hours" IS NULL AND "contracting"."machine_assignment"."gap_unaccounted_hours" IS NULL AND "contracting"."machine_assignment"."gap_reason" IS NULL AND "contracting"."machine_assignment"."gap_resolved_by_user_id" IS NULL) OR ("contracting"."machine_assignment"."gap_resolved_at" IS NOT NULL AND "contracting"."machine_assignment"."gap_travel_hours" >= 0 AND "contracting"."machine_assignment"."gap_unaccounted_hours" >= 0 AND length(btrim("contracting"."machine_assignment"."gap_reason")) > 0 AND "contracting"."machine_assignment"."gap_resolved_by_user_id" IS NOT NULL)),
	CONSTRAINT "machine_assignment_pricing_shape" CHECK (("contracting"."machine_assignment"."rate_unit_amount" IS NULL AND "contracting"."machine_assignment"."computed_amount" IS NULL AND "contracting"."machine_assignment"."final_amount" IS NULL AND "contracting"."machine_assignment"."rate_name" IS NULL AND "contracting"."machine_assignment"."rate_basis" IS NULL AND "contracting"."machine_assignment"."rate_id" IS NULL AND "contracting"."machine_assignment"."rate_measure_type_id" IS NULL) OR ("contracting"."machine_assignment"."computed_amount" >= 0 AND "contracting"."machine_assignment"."final_amount" >= 0 AND (("contracting"."machine_assignment"."rate_id" IS NULL AND "contracting"."machine_assignment"."rate_name" IS NULL AND "contracting"."machine_assignment"."rate_unit_amount" = 0) OR ("contracting"."machine_assignment"."rate_id" IS NOT NULL AND length(btrim("contracting"."machine_assignment"."rate_name")) > 0 AND "contracting"."machine_assignment"."rate_basis" IN ('time', 'measure') AND "contracting"."machine_assignment"."rate_unit_amount" > 0))))
);
--> statement-breakpoint
CREATE TABLE "contracting"."measure" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"assignment_id" uuid NOT NULL,
	"measure_type_id" uuid NOT NULL,
	"quantity" numeric(12, 2) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "measure_quantity_positive" CHECK ("contracting"."measure"."quantity" > 0)
);
--> statement-breakpoint
ALTER TABLE "contracting"."charge_line" ADD CONSTRAINT "charge_line_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "contracting"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."job" ADD CONSTRAINT "job_customer_id_customer_id_fk" FOREIGN KEY ("customer_id") REFERENCES "contracting"."customer"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."job" ADD CONSTRAINT "job_work_type_id_work_type_id_fk" FOREIGN KEY ("work_type_id") REFERENCES "contracting"."work_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."job" ADD CONSTRAINT "job_foreman_user_id_user_id_fk" FOREIGN KEY ("foreman_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."job" ADD CONSTRAINT "job_completed_by_user_id_user_id_fk" FOREIGN KEY ("completed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."job" ADD CONSTRAINT "job_priced_by_user_id_user_id_fk" FOREIGN KEY ("priced_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."job" ADD CONSTRAINT "job_invoiced_by_user_id_user_id_fk" FOREIGN KEY ("invoiced_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."job" ADD CONSTRAINT "job_cancelled_by_user_id_user_id_fk" FOREIGN KEY ("cancelled_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "farm_id_customer_unique" ON "contracting"."farm" USING btree ("id","customer_id");--> statement-breakpoint
ALTER TABLE "contracting"."job" ADD CONSTRAINT "job_farm_customer_fk" FOREIGN KEY ("farm_id","customer_id") REFERENCES "contracting"."farm"("id","customer_id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "contracting"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_machine_id_machine_id_fk" FOREIGN KEY ("machine_id") REFERENCES "contracting"."machine"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_implement_id_implement_id_fk" FOREIGN KEY ("implement_id") REFERENCES "contracting"."implement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_driver_user_id_user_id_fk" FOREIGN KEY ("driver_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_arrival_reading_id_hour_reading_id_fk" FOREIGN KEY ("arrival_reading_id") REFERENCES "contracting"."hour_reading"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_departure_reading_id_hour_reading_id_fk" FOREIGN KEY ("departure_reading_id") REFERENCES "contracting"."hour_reading"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_gap_resolved_by_user_id_user_id_fk" FOREIGN KEY ("gap_resolved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_rate_id_rate_id_fk" FOREIGN KEY ("rate_id") REFERENCES "contracting"."rate"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_rate_measure_type_id_measure_type_id_fk" FOREIGN KEY ("rate_measure_type_id") REFERENCES "contracting"."measure_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."machine_assignment" ADD CONSTRAINT "machine_assignment_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."measure" ADD CONSTRAINT "measure_assignment_id_machine_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "contracting"."machine_assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."measure" ADD CONSTRAINT "measure_measure_type_id_measure_type_id_fk" FOREIGN KEY ("measure_type_id") REFERENCES "contracting"."measure_type"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "charge_line_job_idx" ON "contracting"."charge_line" USING btree ("job_id");--> statement-breakpoint
CREATE UNIQUE INDEX "job_code_unique" ON "contracting"."job" USING btree ("code");--> statement-breakpoint
CREATE INDEX "job_status_idx" ON "contracting"."job" USING btree ("status");--> statement-breakpoint
CREATE INDEX "job_foreman_idx" ON "contracting"."job" USING btree ("foreman_user_id");--> statement-breakpoint
CREATE INDEX "machine_assignment_job_idx" ON "contracting"."machine_assignment" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "machine_assignment_machine_idx" ON "contracting"."machine_assignment" USING btree ("machine_id");--> statement-breakpoint
CREATE UNIQUE INDEX "machine_assignment_arrival_unique" ON "contracting"."machine_assignment" USING btree ("arrival_reading_id");--> statement-breakpoint
CREATE UNIQUE INDEX "machine_assignment_departure_unique" ON "contracting"."machine_assignment" USING btree ("departure_reading_id");--> statement-breakpoint
CREATE UNIQUE INDEX "machine_assignment_machine_on_site_unique" ON "contracting"."machine_assignment" USING btree ("machine_id") WHERE "contracting"."machine_assignment"."arrival_reading_id" IS NOT NULL AND "contracting"."machine_assignment"."departure_reading_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "machine_assignment_implement_on_site_unique" ON "contracting"."machine_assignment" USING btree ("implement_id") WHERE "contracting"."machine_assignment"."implement_id" IS NOT NULL AND "contracting"."machine_assignment"."arrival_reading_id" IS NOT NULL AND "contracting"."machine_assignment"."departure_reading_id" IS NULL;--> statement-breakpoint
CREATE UNIQUE INDEX "measure_assignment_type_unique" ON "contracting"."measure" USING btree ("assignment_id","measure_type_id");--> statement-breakpoint
CREATE FUNCTION contracting.check_job_foreman() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.foreman_user_id IS NOT NULL THEN
    PERFORM 1 FROM public."user" WHERE id = NEW.foreman_user_id AND contracting_role = 'foreman' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Select a person with the Contracting foreman role.'
        USING ERRCODE = '23503', CONSTRAINT = 'job_foreman_role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER job_foreman_role BEFORE INSERT OR UPDATE OF foreman_user_id ON contracting.job
  FOR EACH ROW EXECUTE FUNCTION contracting.check_job_foreman();--> statement-breakpoint
CREATE FUNCTION contracting.protect_assigned_foreman_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contracting_role IS DISTINCT FROM 'foreman'
    AND EXISTS (SELECT 1 FROM contracting.job WHERE foreman_user_id = OLD.id AND status IN ('upcoming', 'active')) THEN
    RAISE EXCEPTION 'Reassign this foreman''s open Jobs before changing their role.'
      USING ERRCODE = '23503', CONSTRAINT = 'job_foreman_role';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER contracting_assigned_foreman_role BEFORE UPDATE OF contracting_role ON public."user"
  FOR EACH ROW EXECUTE FUNCTION contracting.protect_assigned_foreman_role();--> statement-breakpoint
CREATE FUNCTION contracting.check_machine_assignment_driver() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.driver_user_id IS NOT NULL THEN
    PERFORM 1 FROM public."user" WHERE id = NEW.driver_user_id AND contracting_role = 'driver' FOR SHARE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Select a person with the Contracting driver role.'
        USING ERRCODE = '23503', CONSTRAINT = 'machine_assignment_driver_role';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER machine_assignment_driver_role BEFORE INSERT OR UPDATE OF driver_user_id ON contracting.machine_assignment
  FOR EACH ROW EXECUTE FUNCTION contracting.check_machine_assignment_driver();--> statement-breakpoint
CREATE FUNCTION contracting.protect_assignment_driver_role() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
  IF NEW.contracting_role IS DISTINCT FROM 'driver'
    AND EXISTS (
      SELECT 1
      FROM contracting.machine_assignment assignment
      JOIN contracting.job ON contracting.job.id = assignment.job_id
      WHERE assignment.driver_user_id = OLD.id AND contracting.job.status IN ('upcoming', 'active')
    ) THEN
    RAISE EXCEPTION 'Reassign this driver''s open Machine Assignments before changing their role.'
      USING ERRCODE = '23503', CONSTRAINT = 'machine_assignment_driver_role';
  END IF;
  RETURN NEW;
END;
$$;--> statement-breakpoint
CREATE TRIGGER contracting_assignment_driver_role BEFORE UPDATE OF contracting_role ON public."user"
  FOR EACH ROW EXECUTE FUNCTION contracting.protect_assignment_driver_role();
