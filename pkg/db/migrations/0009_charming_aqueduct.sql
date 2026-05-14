ALTER TABLE "audit_events" ALTER COLUMN "entity_id" SET DATA TYPE text USING "entity_id"::text;
