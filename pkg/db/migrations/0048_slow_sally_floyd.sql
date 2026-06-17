ALTER TABLE "products" ADD COLUMN "range_id" uuid;--> statement-breakpoint
DO $$
DECLARE
	v_legacy_range_id uuid;
BEGIN
	IF EXISTS (SELECT 1 FROM "products" WHERE "range_id" IS NULL) THEN
		SELECT "id" INTO v_legacy_range_id
		FROM "product_ranges"
		WHERE lower("name") = lower('Legacy')
		ORDER BY "created_at", "id"
		LIMIT 1;

		IF v_legacy_range_id IS NULL THEN
			INSERT INTO "product_ranges" ("name", "image_data_url")
			VALUES ('Legacy', NULL)
			RETURNING "id" INTO v_legacy_range_id;
		END IF;

		UPDATE "products"
		SET "range_id" = v_legacy_range_id
		WHERE "range_id" IS NULL;
	END IF;
END $$;--> statement-breakpoint
ALTER TABLE "products" ALTER COLUMN "range_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "products" ADD CONSTRAINT "products_range_id_product_ranges_id_fk" FOREIGN KEY ("range_id") REFERENCES "public"."product_ranges"("id") ON DELETE restrict ON UPDATE no action;
