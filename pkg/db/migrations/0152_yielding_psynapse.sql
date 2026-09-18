DROP INDEX "equipment"."parts_code_unique";--> statement-breakpoint
CREATE UNIQUE INDEX "parts_code_unique" ON "equipment"."parts" USING btree (lower("code"));