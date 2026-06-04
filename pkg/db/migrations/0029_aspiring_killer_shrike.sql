DROP INDEX "parts_supplier_id_supplier_code_unique";--> statement-breakpoint
CREATE INDEX "parts_supplier_id_idx" ON "parts" USING btree ("supplier_id");