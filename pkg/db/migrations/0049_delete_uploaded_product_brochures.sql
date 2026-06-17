-- Brochures are now generated from live Product config, never uploaded. Remove any legacy
-- product-owned brochure documents so listing a Product's documents no longer parses a now-invalid
-- 'brochure' type. Generated brochures live on jobs (owner_type = 'job') and are left untouched.
DELETE FROM "documents" WHERE "owner_type" = 'product' AND "metadata" ->> 'type' = 'brochure';
