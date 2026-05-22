DROP INDEX "job_quote_id_unique";--> statement-breakpoint
CREATE INDEX "job_quote_id_idx" ON "job" USING btree ("quote_id");
