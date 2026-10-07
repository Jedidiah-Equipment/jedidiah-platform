CREATE TABLE "contracting"."breakdown_note" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"breakdown_id" uuid NOT NULL,
	"author_user_id" text NOT NULL,
	"text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "breakdown_note_text_not_blank" CHECK (length(btrim("contracting"."breakdown_note"."text")) > 0)
);
--> statement-breakpoint
CREATE TABLE "contracting"."breakdown" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"machine_id" uuid,
	"implement_id" uuid,
	"job_id" uuid,
	"reported_by_user_id" text NOT NULL,
	"reported_at" timestamp with time zone DEFAULT now() NOT NULL,
	"urgency" text NOT NULL,
	"status" text DEFAULT 'open' NOT NULL,
	"description" text NOT NULL,
	"latitude" numeric(9, 6),
	"longitude" numeric(9, 6),
	"photos" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"primary_mechanic_user_id" text,
	"started_at" timestamp with time zone,
	"started_by_user_id" text,
	"solved_at" timestamp with time zone,
	"solved_by_user_id" text,
	"close_out_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "breakdown_subject" CHECK (("contracting"."breakdown"."machine_id" IS NULL) <> ("contracting"."breakdown"."implement_id" IS NULL)),
	CONSTRAINT "breakdown_urgency" CHECK ("contracting"."breakdown"."urgency" IN ('code-red', 'code-green')),
	CONSTRAINT "breakdown_status" CHECK ("contracting"."breakdown"."status" IN ('open', 'in-progress', 'solved')),
	CONSTRAINT "breakdown_description_not_blank" CHECK (length(btrim("contracting"."breakdown"."description")) > 0),
	CONSTRAINT "breakdown_gps_shape" CHECK (("contracting"."breakdown"."latitude" IS NULL) = ("contracting"."breakdown"."longitude" IS NULL)),
	CONSTRAINT "breakdown_status_shape" CHECK (("contracting"."breakdown"."status" = 'open' AND "contracting"."breakdown"."started_at" IS NULL AND "contracting"."breakdown"."solved_at" IS NULL AND "contracting"."breakdown"."close_out_note" IS NULL) OR ("contracting"."breakdown"."status" = 'in-progress' AND "contracting"."breakdown"."started_at" IS NOT NULL AND "contracting"."breakdown"."solved_at" IS NULL AND "contracting"."breakdown"."close_out_note" IS NULL) OR ("contracting"."breakdown"."status" = 'solved' AND "contracting"."breakdown"."started_at" IS NOT NULL AND "contracting"."breakdown"."solved_at" IS NOT NULL AND length(btrim("contracting"."breakdown"."close_out_note")) > 0))
);
--> statement-breakpoint
ALTER TABLE "contracting"."breakdown_note" ADD CONSTRAINT "breakdown_note_breakdown_id_breakdown_id_fk" FOREIGN KEY ("breakdown_id") REFERENCES "contracting"."breakdown"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."breakdown_note" ADD CONSTRAINT "breakdown_note_author_user_id_user_id_fk" FOREIGN KEY ("author_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."breakdown" ADD CONSTRAINT "breakdown_machine_id_machine_id_fk" FOREIGN KEY ("machine_id") REFERENCES "contracting"."machine"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."breakdown" ADD CONSTRAINT "breakdown_implement_id_implement_id_fk" FOREIGN KEY ("implement_id") REFERENCES "contracting"."implement"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."breakdown" ADD CONSTRAINT "breakdown_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "contracting"."job"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."breakdown" ADD CONSTRAINT "breakdown_reported_by_user_id_user_id_fk" FOREIGN KEY ("reported_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."breakdown" ADD CONSTRAINT "breakdown_primary_mechanic_user_id_user_id_fk" FOREIGN KEY ("primary_mechanic_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."breakdown" ADD CONSTRAINT "breakdown_started_by_user_id_user_id_fk" FOREIGN KEY ("started_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."breakdown" ADD CONSTRAINT "breakdown_solved_by_user_id_user_id_fk" FOREIGN KEY ("solved_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "breakdown_note_breakdown_idx" ON "contracting"."breakdown_note" USING btree ("breakdown_id","created_at");--> statement-breakpoint
CREATE INDEX "breakdown_machine_idx" ON "contracting"."breakdown" USING btree ("machine_id","reported_at");--> statement-breakpoint
CREATE INDEX "breakdown_implement_idx" ON "contracting"."breakdown" USING btree ("implement_id","reported_at");--> statement-breakpoint
CREATE INDEX "breakdown_job_idx" ON "contracting"."breakdown" USING btree ("job_id");--> statement-breakpoint
CREATE INDEX "breakdown_status_idx" ON "contracting"."breakdown" USING btree ("status","reported_at");--> statement-breakpoint
CREATE INDEX "breakdown_mechanic_idx" ON "contracting"."breakdown" USING btree ("primary_mechanic_user_id");