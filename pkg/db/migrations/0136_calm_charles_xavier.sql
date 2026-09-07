CREATE TABLE "contracting"."hour_reading" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"sequence" bigint GENERATED ALWAYS AS IDENTITY (sequence name "contracting"."hour_reading_sequence_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 9223372036854775807 START WITH 1 CACHE 1),
	"machine_id" uuid NOT NULL,
	"role" text NOT NULL,
	"value" numeric(10, 1) NOT NULL,
	"captured_at" timestamp with time zone NOT NULL,
	"captured_by_user_id" text NOT NULL,
	"method" text NOT NULL,
	"photo" jsonb,
	"ai_value" numeric(10, 1),
	"ai_confidence" numeric(5, 4),
	"ai_verification" text NOT NULL,
	"disputed" boolean DEFAULT false NOT NULL,
	"dispute_reason" text,
	"disputed_previous_id" uuid,
	"amended_by" text,
	"amended_at" timestamp with time zone,
	"amendment_reason" text,
	CONSTRAINT "hour_reading_role" CHECK ("contracting"."hour_reading"."role" IN ('baseline', 'arrival', 'departure', 'spot')),
	CONSTRAINT "hour_reading_value" CHECK ("contracting"."hour_reading"."value" >= 0 AND ("contracting"."hour_reading"."ai_value" IS NULL OR "contracting"."hour_reading"."ai_value" >= 0)),
	CONSTRAINT "hour_reading_confidence" CHECK ("contracting"."hour_reading"."ai_confidence" BETWEEN 0 AND 1),
	CONSTRAINT "hour_reading_method" CHECK (("contracting"."hour_reading"."method" = 'manual' AND "contracting"."hour_reading"."photo" IS NULL) OR ("contracting"."hour_reading"."method" = 'photo' AND "contracting"."hour_reading"."photo" IS NOT NULL)),
	CONSTRAINT "hour_reading_verification" CHECK ("contracting"."hour_reading"."ai_verification" IN ('pending', 'agrees', 'disagrees', 'low-confidence', 'not-applicable')),
	CONSTRAINT "hour_reading_amendment" CHECK (("contracting"."hour_reading"."amended_by" IS NULL AND "contracting"."hour_reading"."amended_at" IS NULL AND "contracting"."hour_reading"."amendment_reason" IS NULL) OR ("contracting"."hour_reading"."amended_by" IS NOT NULL AND "contracting"."hour_reading"."amended_at" IS NOT NULL AND "contracting"."hour_reading"."amendment_reason" IS NOT NULL AND length(btrim("contracting"."hour_reading"."amendment_reason")) > 0))
);
--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" ADD CONSTRAINT "hour_reading_machine_id_machine_id_fk" FOREIGN KEY ("machine_id") REFERENCES "contracting"."machine"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" ADD CONSTRAINT "hour_reading_captured_by_user_id_user_id_fk" FOREIGN KEY ("captured_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" ADD CONSTRAINT "hour_reading_disputed_previous_id_hour_reading_id_fk" FOREIGN KEY ("disputed_previous_id") REFERENCES "contracting"."hour_reading"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."hour_reading" ADD CONSTRAINT "hour_reading_amended_by_user_id_fk" FOREIGN KEY ("amended_by") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "hour_reading_machine_sequence_idx" ON "contracting"."hour_reading" USING btree ("machine_id","sequence");