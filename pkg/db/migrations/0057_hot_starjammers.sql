CREATE TABLE "feedback_department" (
	"feedback_id" uuid NOT NULL,
	"department" text NOT NULL,
	CONSTRAINT "feedback_department_pkey" PRIMARY KEY("feedback_id","department"),
	CONSTRAINT "feedback_department_value_check" CHECK ("feedback_department"."department" IN ('procurement', 'supply', 'fabrication', 'paint', 'assembly'))
);
--> statement-breakpoint
CREATE TABLE "feedback_user" (
	"feedback_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	CONSTRAINT "feedback_user_pkey" PRIMARY KEY("feedback_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "feedback_department" ADD CONSTRAINT "feedback_department_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_user" ADD CONSTRAINT "feedback_user_feedback_id_feedback_id_fk" FOREIGN KEY ("feedback_id") REFERENCES "public"."feedback"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "feedback_user" ADD CONSTRAINT "feedback_user_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;