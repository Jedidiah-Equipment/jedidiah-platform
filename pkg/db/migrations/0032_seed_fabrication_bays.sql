INSERT INTO "job_bay" ("id", "department", "name", "schedule_origin")
VALUES
	('00000000-0000-4000-8000-000000000b01', 'fabrication', 'Fabrication Bay 1', date_trunc('day', now())),
	('00000000-0000-4000-8000-000000000b02', 'fabrication', 'Fabrication Bay 2', date_trunc('day', now())),
	('00000000-0000-4000-8000-000000000b03', 'fabrication', 'Fabrication Bay 3', date_trunc('day', now())),
	('00000000-0000-4000-8000-000000000b04', 'fabrication', 'Fabrication Bay 4', date_trunc('day', now())),
	('00000000-0000-4000-8000-000000000b05', 'fabrication', 'Fabrication Bay 5', date_trunc('day', now()))
ON CONFLICT ("id") DO UPDATE SET
	"department" = excluded."department",
	"name" = excluded."name",
	"updated_at" = now();
