CREATE TABLE "user_department" (
	"user_id" text NOT NULL,
	"department" text NOT NULL,
	CONSTRAINT "user_department_user_id_department_pk" PRIMARY KEY("user_id","department")
);
--> statement-breakpoint
ALTER TABLE "user_department" ADD CONSTRAINT "user_department_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;
