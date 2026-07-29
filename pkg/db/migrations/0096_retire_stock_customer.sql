-- Data-only cleanup that retires the placeholder "Stock" Customer. Building for the showroom no longer
-- needs a fake buyer, so the machines raised against it become Stock Builds: their Jobs lose their
-- placeholder Quote, those Quotes are deleted, and the Customer row goes so it stops appearing in every
-- customer picker. Their Units end with no Ownership Transfers, which is what makes them read as Stock.
--
-- The id below was supplied by Dean on 2026-07-28 and is the same row #0088 excluded from ownership. It
-- is matched by id on purpose — never by company name, which is editable and which a real Customer may
-- legitimately share.
--
-- Nothing about the machines themselves is touched: serial, CFO, Documents, Slots, and completion dates
-- all survive. Every statement is idempotent, so re-running this migration changes nothing.

-- The Quote deletions below cascade to Quote Documents and Feedback. The epic confirmed there are none;
-- this stops the run rather than shredding paperwork nobody knew about.
DO $$
DECLARE
	attached_count integer;
BEGIN
	SELECT count(*) INTO attached_count
	FROM (
		SELECT 1
		FROM "documents"
		INNER JOIN "quote" ON "quote"."id" = "documents"."quote_id"
		WHERE "quote"."customer_id" = '5c32124d-9b97-49f9-8529-3d5d4679c392'
		UNION ALL
		SELECT 1
		FROM "feedback"
		INNER JOIN "quote" ON "quote"."id" = "feedback"."quote_id"
		WHERE "quote"."customer_id" = '5c32124d-9b97-49f9-8529-3d5d4679c392'
	) AS "attached";

	IF attached_count > 0 THEN
		RAISE EXCEPTION 'Stock Customer Quotes have % Document(s) or Feedback item(s) attached; deal with them by hand before retiring the Customer', attached_count;
	END IF;
END $$;--> statement-breakpoint

-- The fiction, recorded as ownership: transfers written by the live writer between #0088 and this
-- cleanup. The Units were never sold, so they end with no transfers at all — the same state the
-- backfill left the historical ones in. `to_customer_id` is ON DELETE restrict, so this also has to
-- happen before the Customer row can go.
DELETE FROM "product_unit_ownership_transfer"
WHERE "to_customer_id" = '5c32124d-9b97-49f9-8529-3d5d4679c392'
	OR "from_customer_id" = '5c32124d-9b97-49f9-8529-3d5d4679c392';--> statement-breakpoint

-- The Jobs become Stock Builds. Only Jobs that carry a Unit can lose their Quote and still satisfy
-- job_product_unit_or_quote_required; a Custom Job against the placeholder would leave its Quote behind
-- and fail the delete below loudly rather than being silently orphaned.
UPDATE "job"
SET "quote_id" = NULL
FROM "quote"
WHERE "quote"."id" = "job"."quote_id"
	AND "quote"."customer_id" = '5c32124d-9b97-49f9-8529-3d5d4679c392'
	AND "job"."product_unit_id" IS NOT NULL;--> statement-breakpoint

DELETE FROM "quote"
WHERE "customer_id" = '5c32124d-9b97-49f9-8529-3d5d4679c392';--> statement-breakpoint

DELETE FROM "customers"
WHERE "id" = '5c32124d-9b97-49f9-8529-3d5d4679c392';
