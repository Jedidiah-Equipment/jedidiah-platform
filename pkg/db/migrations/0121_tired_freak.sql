DROP INDEX "job_quote_id_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "job_quote_id_live_unique" ON "job" USING btree ("quote_id") WHERE "job"."cancelled_at" IS NULL;