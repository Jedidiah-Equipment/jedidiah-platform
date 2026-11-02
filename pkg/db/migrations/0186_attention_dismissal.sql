CREATE TABLE "contracting"."attention_dismissal" (
	"assignment_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"dismissed_at" timestamp with time zone DEFAULT now() NOT NULL,
	"dismissed_by_user_id" text NOT NULL,
	CONSTRAINT "attention_dismissal_assignment_id_kind_pk" PRIMARY KEY("assignment_id","kind"),
	CONSTRAINT "attention_dismissal_kind" CHECK ("contracting"."attention_dismissal"."kind" IN ('travel-over-threshold', 'travel-clamped', 'john-deere-difference'))
);
--> statement-breakpoint
ALTER TABLE "contracting"."attention_dismissal" ADD CONSTRAINT "attention_dismissal_assignment_id_machine_assignment_id_fk" FOREIGN KEY ("assignment_id") REFERENCES "contracting"."machine_assignment"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "contracting"."attention_dismissal" ADD CONSTRAINT "attention_dismissal_dismissed_by_user_id_user_id_fk" FOREIGN KEY ("dismissed_by_user_id") REFERENCES "public"."user"("id") ON DELETE no action ON UPDATE no action;