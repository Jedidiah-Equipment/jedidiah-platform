ALTER TABLE "products" ADD COLUMN "range_id" uuid;--> statement-breakpoint
DO $$
DECLARE
	v_crosshaul_range_id uuid;
BEGIN
	SELECT "id" INTO v_crosshaul_range_id
	FROM "product_ranges"
	WHERE lower("name") = lower('Crosshaul')
	ORDER BY "created_at", "id"
	LIMIT 1;

	IF v_crosshaul_range_id IS NULL THEN
		v_crosshaul_range_id := '00000000-0000-4000-8000-000000000488';

		INSERT INTO "product_ranges" ("id", "name", "image_data_url")
		VALUES (v_crosshaul_range_id, 'Crosshaul', NULL);
	END IF;

	UPDATE "products"
	SET "range_id" = v_crosshaul_range_id
	WHERE "range_id" IS NULL;
END $$;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "range_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_range_id_product_ranges_id_fk" FOREIGN KEY ("range_id") REFERENCES "public"."product_ranges"("id") ON DELETE restrict ON UPDATE no action;
