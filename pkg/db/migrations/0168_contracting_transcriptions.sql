CREATE TABLE "contracting"."transcription_hint" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"rule" text NOT NULL,
	"keyterm" text,
	"source_transcription_id" uuid,
	"retired_at" timestamp with time zone,
	"superseded_by_hint_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcription_hint_rule_not_blank" CHECK (length(btrim("contracting"."transcription_hint"."rule")) > 0),
	CONSTRAINT "transcription_hint_keyterm_length" CHECK ("contracting"."transcription_hint"."keyterm" IS NULL OR length("contracting"."transcription_hint"."keyterm") BETWEEN 1 AND 50)
);
--> statement-breakpoint
CREATE TABLE "contracting"."transcription" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"created_by_user_id" text NOT NULL,
	"purpose" text NOT NULL,
	"language" text,
	"raw_text" text NOT NULL,
	"shown_text" text NOT NULL,
	"saved_text" text,
	"saved_at" timestamp with time zone,
	"hint_derived_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "transcription_saved_shape" CHECK (("contracting"."transcription"."saved_text" IS NULL) = ("contracting"."transcription"."saved_at" IS NULL)),
	CONSTRAINT "transcription_purpose_not_blank" CHECK (length(btrim("contracting"."transcription"."purpose")) > 0)
);
--> statement-breakpoint
ALTER TABLE "contracting"."transcription_hint" ADD CONSTRAINT "transcription_hint_source_transcription_id_transcription_id_fk" FOREIGN KEY ("source_transcription_id") REFERENCES "contracting"."transcription"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."transcription_hint" ADD CONSTRAINT "transcription_hint_superseded_by_hint_id_transcription_hint_id_fk" FOREIGN KEY ("superseded_by_hint_id") REFERENCES "contracting"."transcription_hint"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."transcription" ADD CONSTRAINT "transcription_created_by_user_id_user_id_fk" FOREIGN KEY ("created_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "transcription_hint_active_idx" ON "contracting"."transcription_hint" USING btree ("retired_at","created_at");--> statement-breakpoint
CREATE INDEX "transcription_created_by_idx" ON "contracting"."transcription" USING btree ("created_by_user_id","created_at");