-- Job Estimate Snapshots frozen before the Labor Rate Card carry labour lines as hours at a rate and no
-- overhead floors. Reshape them the way 0144 backfilled live rows: one staff member at nine hours a day
-- with no consumables or management overhead, so every frozen total stands. Snapshots frozen before
-- 0142 also gain the empty unrated-Department list.
UPDATE "equipment"."job_estimate_snapshot"
SET "payload" = "payload" || jsonb_build_object(
  'consumablesCostFloor', COALESCE("payload"->'consumablesCostFloor', '0'::jsonb),
  'managementOverheadCostFloor', COALESCE("payload"->'managementOverheadCostFloor', '0'::jsonb),
  'managementOverheadPercentage', COALESCE("payload"->'managementOverheadPercentage', '0'::jsonb),
  'missing', ("payload"->'missing') || jsonb_build_object(
    'unratedDepartments', COALESCE("payload"->'missing'->'unratedDepartments', '[]'::jsonb)),
  'laborHours', COALESCE((
    SELECT jsonb_agg(
      CASE WHEN line ? 'daysPerStaff' THEN line
      ELSE (line - 'cost') || jsonb_build_object(
        'consumablesCost', 0,
        'consumablesPercentage', 0,
        'daysPerStaff', GREATEST(ROUND((line->>'hours')::numeric / 9, 2), 0.01),
        'departmentTotal', line->'cost',
        'laborCost', line->'cost',
        'staffCount', 1)
      END ORDER BY ordinality)
    FROM jsonb_array_elements("payload"->'laborHours') WITH ORDINALITY AS lines(line, ordinality)
  ), '[]'::jsonb))
WHERE NOT ("payload" ? 'consumablesCostFloor')
   OR NOT ("payload"->'missing' ? 'unratedDepartments')
   OR EXISTS (SELECT 1 FROM jsonb_array_elements("payload"->'laborHours') AS line WHERE NOT (line ? 'daysPerStaff'));
