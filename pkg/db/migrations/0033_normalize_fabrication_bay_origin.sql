UPDATE "job_bay"
SET
	"schedule_origin" = date_trunc('day', "schedule_origin"),
	"updated_at" = now()
WHERE "id" IN (
	'00000000-0000-4000-8000-000000000b01',
	'00000000-0000-4000-8000-000000000b02',
	'00000000-0000-4000-8000-000000000b03',
	'00000000-0000-4000-8000-000000000b04',
	'00000000-0000-4000-8000-000000000b05'
)
AND NOT EXISTS (
	SELECT 1
	FROM "job_slot"
	WHERE "job_slot"."bay_id" = "job_bay"."id"
);
