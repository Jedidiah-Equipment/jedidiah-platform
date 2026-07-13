CREATE TABLE "changelog_view" (
	"user_id" text PRIMARY KEY NOT NULL,
	"last_seen_release_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "changelog_view" ADD CONSTRAINT "changelog_view_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;