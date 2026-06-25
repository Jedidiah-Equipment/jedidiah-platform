CREATE TABLE "feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"submitter_id" text NOT NULL,
	"subject_type" text NOT NULL,
	"quote_id" uuid,
	"job_id" uuid,
	"kind" text NOT NULL,
	"text" text NOT NULL,
	"internal_notes" text,
	"status" text DEFAULT 'open' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "feedback_subject_type_check" CHECK ("feedback"."subject_type" IN ('quote', 'job')),
	CONSTRAINT "feedback_kind_check" CHECK ("feedback"."kind" IN ('general', 'corrective-feedback-department', 'corrective-feedback-user')),
	CONSTRAINT "feedback_status_check" CHECK ("feedback"."status" IN ('open', 'resolved', 'closed')),
	CONSTRAINT "feedback_text_nonempty" CHECK (length(trim("feedback"."text")) > 0),
	CONSTRAINT "feedback_subject_exactly_one" CHECK (("feedback"."subject_type" = 'quote' AND "feedback"."quote_id" IS NOT NULL AND "feedback"."job_id" IS NULL)
        OR ("feedback"."subject_type" = 'job' AND "feedback"."job_id" IS NOT NULL AND "feedback"."quote_id" IS NULL))
);
--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_submitter_id_user_id_fk" FOREIGN KEY ("submitter_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_quote_id_quote_id_fk" FOREIGN KEY ("quote_id") REFERENCES "public"."quote"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback" ADD CONSTRAINT "feedback_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE cascade ON UPDATE no action;