-- Data-only backfill giving every Job built before the extraction the Build Spec it would have been
-- created with. 0091 introduced "job_build_spec_assembly" but nothing populated it for existing rows,
-- so a legacy Job's Build Spec was empty while its CFO still listed what was fitted.
--
-- That gap is load-bearing for exactly the machines this epic exists to sell: a Unit's As-Built Spec is
-- the union of its Jobs' Build Specs, so an Allocation Quote against legacy showroom stock would read
-- an empty As-Built Spec, treat every already-fitted Optional Assembly as new, and source a Rework Job
-- refitting work the machine already carries.
--
-- The Quote's selected Assemblies are the seed a build-to-order Job copies at creation, so replaying
-- that copy reproduces the Build Spec the Job would hold had it been created after 0091 — including
-- the quoted name, which is the snapshot that must survive a catalog rename. Sequence is 0-based to
-- match the insert order the application writes.
--
-- Idempotent: a Job that already holds any Build Spec row is skipped entirely.
--
-- Only build-to-order Jobs are in range, and that is load-bearing rather than incidental. A Rework Job
-- must hold only the Assemblies it adds, but its Allocation Quote's selections also carry the As-Built
-- ones seeded from the Unit, so replaying them here would double-count what the machine already has.
-- Three things keep Rework out: it postdates this table (#1035 followed #1030), it is refused unless
-- its Build Spec is non-empty, and that Spec is written in the same transaction as the Job — so every
-- Rework Job holds a row and the NOT EXISTS guard skips it. Preserve that guard if this is ever re-run.

INSERT INTO "job_build_spec_assembly" (
	"job_id",
	"product_assembly_id",
	"assembly_name",
	"sequence"
)
SELECT
	"seed"."job_id",
	"seed"."product_assembly_id",
	"seed"."quoted_name",
	(row_number() OVER (PARTITION BY "seed"."job_id" ORDER BY "seed"."created_at", "seed"."id") - 1)::integer
FROM (
	SELECT
		"job"."id" AS "job_id",
		"quote_selected_assemblies"."product_assembly_id",
		"quote_selected_assemblies"."quoted_name",
		"quote_selected_assemblies"."created_at",
		"quote_selected_assemblies"."id"
	FROM "job"
	INNER JOIN "quote_selected_assemblies" ON "quote_selected_assemblies"."quote_id" = "job"."quote_id"
	WHERE "job"."quote_id" IS NOT NULL
		AND NOT EXISTS (
			SELECT 1 FROM "job_build_spec_assembly"
			WHERE "job_build_spec_assembly"."job_id" = "job"."id"
		)
) AS "seed";
