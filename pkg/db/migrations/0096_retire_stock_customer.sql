-- Data-only cleanup that retires the placeholder "Stock" Customer. Building for the showroom no longer
-- needs a fake buyer, so the machines raised against it become Stock Builds: their Jobs lose their
-- placeholder Quote, those Quotes are deleted, and the Customer row goes so it stops appearing in every
-- customer picker. Their Units end with no Ownership Transfers, which is what makes them read as Stock.
--
-- The id below was supplied by Dean on 2026-07-28 and is the same row #0088 excluded from ownership. It
-- is matched by id on purpose — never by company name, which is editable and which a real Customer may
-- legitimately share.
--
-- Nothing about the machines themselves is touched: serial, Build Spec, CFO, Job Documents, Slots, and
-- completion dates all survive. Every statement is idempotent, so re-running this migration changes
-- nothing.

-- One fact this cleanup cannot repair on its own: a Custom Job has no Unit, so it cannot be left
-- quoteless under job_product_unit_or_quote_required. Stop the run with a diagnostic rather than dying
-- on a bare check violation.
DO $$
DECLARE
	quoteless_count integer;
BEGIN
	SELECT count(*) INTO quoteless_count
	FROM "job"
	INNER JOIN "quote" ON "quote"."id" = "job"."quote_id"
	WHERE "quote"."customer_id" = '5c32124d-9b97-49f9-8529-3d5d4679c392'
		AND "job"."product_unit_id" IS NULL;

	IF quoteless_count > 0 THEN
		RAISE EXCEPTION 'Stock Customer Quotes source % Job(s) with no Product Unit; a Job with neither cannot exist, so deal with them by hand before retiring the Customer', quoteless_count;
	END IF;
END $$;--> statement-breakpoint

-- The placeholder never owned a machine — we did. So a Transfer that names it on either side has that
-- side rewritten to null ("we hold it"), and one that then records no movement at all is deleted. A
-- showroom build (null -> placeholder, written by the live writer between #0088 and this cleanup) goes,
-- leaving the Unit with no Transfers at all, exactly as the backfill left the historical ones; a genuine
-- sale out of the showroom keeps its buyer, and a return to Stock keeps its round trip. Both columns are
-- ON DELETE restrict, so this also has to happen before the Customer row can go.
DELETE FROM "product_unit_ownership_transfer"
WHERE ("to_customer_id" = '5c32124d-9b97-49f9-8529-3d5d4679c392' AND "from_customer_id" IS NULL)
	OR ("from_customer_id" = '5c32124d-9b97-49f9-8529-3d5d4679c392' AND "to_customer_id" IS NULL);--> statement-breakpoint

UPDATE "product_unit_ownership_transfer"
SET "from_customer_id" = NULL
WHERE "from_customer_id" = '5c32124d-9b97-49f9-8529-3d5d4679c392';--> statement-breakpoint

UPDATE "product_unit_ownership_transfer"
SET "to_customer_id" = NULL
WHERE "to_customer_id" = '5c32124d-9b97-49f9-8529-3d5d4679c392';--> statement-breakpoint

-- The Jobs become Stock Builds. Their Build Spec, CFO, Documents, and Slots hang off the Job, not the
-- Quote, so they come through untouched; only the sale that never happened goes.
UPDATE "job"
SET "quote_id" = NULL
FROM "quote"
WHERE "quote"."id" = "job"."quote_id"
	AND "quote"."customer_id" = '5c32124d-9b97-49f9-8529-3d5d4679c392';--> statement-breakpoint

-- Cascades to the placeholder Quotes' selected Assemblies and Work Items, and nulls the sourcing Quote
-- on any Transfer that cited one. Any Documents and Feedback attached to a placeholder Quote cascade
-- away with it — Dean confirmed on 2026-07-29 that paperwork raised against a fake buyer is worth
-- nothing. Documents owned by the Job or the Product are on a different owner column and survive.
DELETE FROM "quote"
WHERE "customer_id" = '5c32124d-9b97-49f9-8529-3d5d4679c392';--> statement-breakpoint

DELETE FROM "customers"
WHERE "id" = '5c32124d-9b97-49f9-8529-3d5d4679c392';
