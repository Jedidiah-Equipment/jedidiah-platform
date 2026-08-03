CREATE TABLE "job_stock_close_out" (
	"actor_user_id" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"job_id" uuid PRIMARY KEY NOT NULL,
	"note" text,
	CONSTRAINT "job_stock_close_out_note_nonempty" CHECK ("job_stock_close_out"."note" IS NULL OR length(trim("job_stock_close_out"."note")) > 0)
);
--> statement-breakpoint
ALTER TABLE "job_stock_close_out" ADD CONSTRAINT "job_stock_close_out_actor_user_id_user_id_fk" FOREIGN KEY ("actor_user_id") REFERENCES "public"."user"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "job_stock_close_out" ADD CONSTRAINT "job_stock_close_out_job_id_job_id_fk" FOREIGN KEY ("job_id") REFERENCES "public"."job"("id") ON DELETE restrict ON UPDATE no action;