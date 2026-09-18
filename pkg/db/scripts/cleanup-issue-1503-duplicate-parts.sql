-- Production repair for GitHub issue #1503.
--
-- This is plain PostgreSQL and can be pasted into Railway's query editor. Back up production
-- first. For a dry run, change the final COMMIT to ROLLBACK; every statement and guard will run,
-- but PostgreSQL will discard the deletions.
--
-- This script deliberately keeps the older Part in each case-only collision. The newer Parts all
-- came from the 2026-09-17 bulk import. It removes their three zero-priced lines from draft
-- Purchase Orders 11 and 25, then removes the 47 newer Parts. Every observed production fact is
-- asserted again inside the transaction; any drift aborts and rolls the whole repair back.
-- Existing audit events are retained as historical records of what the import did.

BEGIN ISOLATION LEVEL SERIALIZABLE;

SET LOCAL lock_timeout = '10s';
SET LOCAL statement_timeout = '2min';

-- Prevent a concurrent catalog or Purchase Order write from invalidating the repair plan.
LOCK TABLE equipment.parts IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE equipment.purchase_order IN SHARE ROW EXCLUSIVE MODE;
LOCK TABLE equipment.purchase_order_line IN SHARE ROW EXCLUSIVE MODE;

CREATE TEMP TABLE issue_1503_duplicate_parts ON COMMIT DROP AS
WITH part_creations AS (
  SELECT
    p.id,
    p.code,
    lower(btrim(p.code)) AS folded_code,
    created.occurred_at AS created_at,
    count(*) OVER (PARTITION BY lower(btrim(p.code))) AS collision_size
  FROM equipment.parts p
  LEFT JOIN LATERAL (
    SELECT ae.occurred_at
    FROM public.audit_events ae
    WHERE ae.entity_type = 'part'
      AND ae.entity_id = p.id::text
      AND ae.action = 'created'
    ORDER BY ae.occurred_at
    LIMIT 1
  ) created ON true
), ranked_collisions AS (
  SELECT
    id,
    code,
    folded_code,
    created_at,
    row_number() OVER (
      PARTITION BY folded_code
      ORDER BY created_at NULLS LAST, id
    ) AS creation_rank
  FROM part_creations
  WHERE collision_size = 2
)
SELECT
  survivor.folded_code,
  survivor.id AS survivor_id,
  survivor.code AS survivor_code,
  duplicate.id AS duplicate_id,
  duplicate.code AS duplicate_code
FROM ranked_collisions survivor
JOIN ranked_collisions duplicate USING (folded_code)
WHERE survivor.creation_rank = 1
  AND duplicate.creation_rank = 2
  AND duplicate.created_at = timestamptz '2026-09-17 13:28:38.983271+00';

DO $cleanup$
DECLARE
  candidate_count integer;
  collision_count integer;
  duplicate_line_count integer;
  deleted_line_count integer;
  deleted_part_count integer;
  unexpected_reference_count bigint;
  unsafe_line_count integer;
BEGIN
  SELECT count(*) INTO candidate_count
  FROM issue_1503_duplicate_parts;

  IF candidate_count <> 47 THEN
    RAISE EXCEPTION
      'Issue #1503 cleanup expected 47 duplicate Parts, found %. No changes were made.',
      candidate_count;
  END IF;

  -- The newer Parts must have no operational history or catalog references. Purchase Order lines
  -- are checked separately because three known duplicate lines are intentionally removed below.
  SELECT
    (SELECT count(*)
     FROM equipment.assembly_parts x
     JOIN issue_1503_duplicate_parts d ON d.duplicate_id = x.part_id)
    + (SELECT count(*)
       FROM equipment.job_cfo_part x
       JOIN issue_1503_duplicate_parts d ON d.duplicate_id = x.part_id)
    + (SELECT count(*)
       FROM equipment.part_bom x
       JOIN issue_1503_duplicate_parts d
         ON d.duplicate_id = x.component_part_id OR d.duplicate_id = x.parent_part_id)
    + (SELECT count(*)
       FROM equipment.product_material_line x
       JOIN issue_1503_duplicate_parts d ON d.duplicate_id = x.part_id)
    + (SELECT count(*)
       FROM equipment.purchase_order_amendment x
       JOIN issue_1503_duplicate_parts d
         ON d.duplicate_id = x.part_id OR d.duplicate_id = x.new_part_id)
    + (SELECT count(*)
       FROM equipment.stock_build x
       JOIN issue_1503_duplicate_parts d ON d.duplicate_id = x.built_part_id)
    + (SELECT count(*)
       FROM equipment.stock_movement x
       JOIN issue_1503_duplicate_parts d ON d.duplicate_id = x.part_id)
  INTO unexpected_reference_count;

  IF unexpected_reference_count <> 0 THEN
    RAISE EXCEPTION
      'Issue #1503 cleanup found % unexpected references to duplicate Parts. No changes were made.',
      unexpected_reference_count;
  END IF;

  SELECT count(*) INTO duplicate_line_count
  FROM equipment.purchase_order_line line
  JOIN issue_1503_duplicate_parts d ON d.duplicate_id = line.part_id;

  IF duplicate_line_count <> 3 THEN
    RAISE EXCEPTION
      'Issue #1503 cleanup expected 3 duplicate Purchase Order lines, found %. No changes were made.',
      duplicate_line_count;
  END IF;

  SELECT count(*) INTO unsafe_line_count
  FROM equipment.purchase_order_line duplicate_line
  JOIN issue_1503_duplicate_parts d ON d.duplicate_id = duplicate_line.part_id
  JOIN equipment.purchase_order po ON po.id = duplicate_line.purchase_order_id
  WHERE po.status <> 'draft'
     OR duplicate_line.quantity <> 1
     OR duplicate_line.unit_price <> 0
     OR NOT (
       (po.code = 25 AND d.folded_code = '2 core electrical cable')
       OR (po.code = 11 AND d.folded_code IN (
         'dee shackle 3.25t screw pin',
         'grade 80 chain short link 20mm apex 80'
       ))
     )
     OR NOT EXISTS (
       SELECT 1
       FROM equipment.purchase_order_line survivor_line
       WHERE survivor_line.purchase_order_id = duplicate_line.purchase_order_id
         AND survivor_line.part_id = d.survivor_id
     );

  IF unsafe_line_count <> 0 THEN
    RAISE EXCEPTION
      'Issue #1503 cleanup found % duplicate Purchase Order lines that are not safe to remove. No changes were made.',
      unsafe_line_count;
  END IF;

  DELETE FROM equipment.purchase_order_line duplicate_line
  USING issue_1503_duplicate_parts d
  WHERE duplicate_line.part_id = d.duplicate_id;

  GET DIAGNOSTICS deleted_line_count = ROW_COUNT;

  IF deleted_line_count <> 3 THEN
    RAISE EXCEPTION
      'Issue #1503 cleanup deleted % Purchase Order lines instead of 3. Rolling back.',
      deleted_line_count;
  END IF;

  DELETE FROM equipment.parts duplicate
  USING issue_1503_duplicate_parts d
  WHERE duplicate.id = d.duplicate_id;

  GET DIAGNOSTICS deleted_part_count = ROW_COUNT;

  IF deleted_part_count <> 47 THEN
    RAISE EXCEPTION
      'Issue #1503 cleanup deleted % Parts instead of 47. Rolling back.',
      deleted_part_count;
  END IF;

  SELECT count(*) INTO collision_count
  FROM (
    SELECT lower(btrim(code))
    FROM equipment.parts
    GROUP BY lower(btrim(code))
    HAVING count(*) > 1
  ) remaining_collisions;

  IF collision_count <> 0 THEN
    RAISE EXCEPTION
      'Issue #1503 cleanup left % case-only Part Code collisions. Rolling back.',
      collision_count;
  END IF;

  RAISE NOTICE
    'Issue #1503 cleanup verified: deleted % duplicate Purchase Order lines and % duplicate Parts.',
    deleted_line_count,
    deleted_part_count;
END
$cleanup$;

COMMIT;
