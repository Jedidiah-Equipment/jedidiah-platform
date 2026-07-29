-- Data-only backfill for the Product Unit extraction. Every Job that already carries a serial becomes
-- one Product Unit holding that machine's identity, and every machine built for a real Customer gains
-- the Ownership Transfer recording who it was built for.
--
-- The placeholder "Stock" Customer is excluded from ownership: those machines were built for the
-- showroom and never sold, so they must resolve as Stock (no transfers at all). The id below was
-- supplied by Dean on 2026-07-28 and is matched by id on purpose — never by company name, which is
-- editable. The Customer row itself is retired separately.
--
-- Cancelled sales are excluded for the same reason: the machine was never handed over, so it must
-- resolve as Stock. A live cancellation writes an out-and-back pair because the transfer genuinely
-- happened and then reversed; a backfill has no such history to preserve, so it writes nothing and
-- the Unit reads Stock directly.
--
-- Every statement is idempotent, so re-running this migration inserts nothing new.

INSERT INTO "product_unit" (
	"product_id",
	"product_serial_prefix",
	"product_serial_year",
	"product_serial_sequence",
	"product_serial_number",
	"vin_number",
	"created_at",
	"updated_at"
)
SELECT
	"job"."product_id",
	"job"."product_serial_prefix",
	"job"."product_serial_year",
	"job"."product_serial_sequence",
	"job"."product_serial_number",
	"job"."vin_number",
	"job"."created_at",
	"job"."updated_at"
FROM "job"
WHERE "job"."product_serial_number" IS NOT NULL
	AND "job"."product_id" IS NOT NULL
	AND NOT EXISTS (
		SELECT 1 FROM "product_unit"
		WHERE "product_unit"."product_serial_number" = "job"."product_serial_number"
	);--> statement-breakpoint

UPDATE "job"
SET "product_unit_id" = "product_unit"."id"
FROM "product_unit"
WHERE "product_unit"."product_serial_number" = "job"."product_serial_number"
	AND "job"."product_unit_id" IS NULL;--> statement-breakpoint

INSERT INTO "product_unit_ownership_transfer" (
	"product_unit_id",
	"from_customer_id",
	"to_customer_id",
	"occurred_on",
	"source_quote_id",
	"actor_user_id",
	"note",
	"created_at"
)
SELECT
	"job"."product_unit_id",
	NULL,
	"quote"."customer_id",
	-- Plant business date the build was booked; the server derives plant dates in this zone.
	("job"."created_at" AT TIME ZONE 'Africa/Johannesburg')::date,
	"quote"."id",
	-- Null actor: the system wrote this row, matching the audit log's system convention.
	NULL,
	NULL,
	"job"."created_at"
FROM "job"
INNER JOIN "quote" ON "quote"."id" = "job"."quote_id"
WHERE "job"."product_unit_id" IS NOT NULL
	AND "job"."cancelled_at" IS NULL
	AND "quote"."status" <> 'cancelled'
	AND "quote"."customer_id" <> '5c32124d-9b97-49f9-8529-3d5d4679c392'
	AND NOT EXISTS (
		SELECT 1 FROM "product_unit_ownership_transfer"
		WHERE "product_unit_ownership_transfer"."product_unit_id" = "job"."product_unit_id"
	);
