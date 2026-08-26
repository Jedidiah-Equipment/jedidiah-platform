-- Product reviewed these legacy Assembly rows in issue #1287. Their quantities were entered as
-- millimetres, but Assembly Parts now represent whole purchased pieces. Move them to the Product
-- Material List, whose linear quantities are expressed in purchase lengths, and fail closed if the
-- reviewed production data has drifted before this migration reaches it.
DO $$
DECLARE
	reviewed_count integer;
	reviewed_config_count integer;
	reviewed_assembly_count integer;
	reviewed_part_count integer;
	source_count integer;
	keyed_source_count integer;
	matching_target_count integer;
	conflicting_target_count integer;
	invalid_count integer;
	sources_already_repaired boolean := false;
BEGIN
	CREATE TEMP TABLE issue_1287_material_repair (
		review_id text PRIMARY KEY,
		product_id uuid NOT NULL,
		assembly_id uuid NOT NULL,
		part_id uuid NOT NULL,
		original_quantity integer NOT NULL,
		material_quantity numeric(14, 3) NOT NULL,
		UNIQUE (assembly_id, part_id),
		UNIQUE (product_id, part_id)
	) ON COMMIT DROP;

	CREATE TEMP TABLE issue_1287_part_config (
		part_id uuid PRIMARY KEY,
		previous_purchase_length_mm integer,
		desired_purchase_length_mm integer NOT NULL,
		set_periodic boolean NOT NULL
	) ON COMMIT DROP;

	CREATE TEMP TABLE issue_1287_product_audit_change (
		product_id uuid NOT NULL,
		assembly_id uuid,
		change_key text NOT NULL,
		change jsonb NOT NULL,
		PRIMARY KEY (product_id, change_key)
	) ON COMMIT DROP;

	CREATE TEMP TABLE issue_1287_part_audit_change (
		part_id uuid PRIMARY KEY,
		part_name text NOT NULL,
		changes jsonb NOT NULL
	) ON COMMIT DROP;

	INSERT INTO issue_1287_material_repair
		(review_id, product_id, assembly_id, part_id, original_quantity, material_quantity)
	VALUES
		('L001','dc6413b2-b325-4611-a6c0-7b924e1b92fb','557d511e-dadc-4d30-8691-859fd8f66ef2','cb61fef6-e462-4f8c-a3e5-cbdd92bbb583',20000,20.000),
		('L002','02872a63-25ce-42a6-a72e-831640fc3d68','140665be-f9b6-4631-a01a-3d1c5758a96b','cb61fef6-e462-4f8c-a3e5-cbdd92bbb583',20000,20.000),
		('L003','196dcc99-f80e-46d1-8413-5a16112d98a2','bb221cf1-b772-4610-b998-65a12fd287b4','cb61fef6-e462-4f8c-a3e5-cbdd92bbb583',20000,20.000),
		('L004','97ce9777-8970-4939-b6de-2dd2a5459782','9b323c97-1081-4710-b0e9-ea59b724ffa7','cb61fef6-e462-4f8c-a3e5-cbdd92bbb583',20000,20.000),
		('L005','a3e00ce8-e6af-42e9-8b77-0555302fe187','396cec6e-e502-4212-89c1-46cb158c7370','cb61fef6-e462-4f8c-a3e5-cbdd92bbb583',20000,20.000),
		('L006','e1b53448-3eeb-4229-b0bd-d5838b114b88','17aad6fd-4d1c-46ac-ada7-758a5b9d2746','cb61fef6-e462-4f8c-a3e5-cbdd92bbb583',20000,20.000),
		('L007','49931a72-ee83-44f4-92a0-f73295ec73c0','e296d94f-cd38-4cec-acf2-d6eb9c118315','cb61fef6-e462-4f8c-a3e5-cbdd92bbb583',20000,20.000),
		('L008','ae7c5455-1543-46be-907e-14523625aefb','c4b77fa0-9999-459d-a2e9-c85282ba64c4','cb61fef6-e462-4f8c-a3e5-cbdd92bbb583',20000,20.000),
		('L009','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','6d4bfc4c-93b6-483b-bc3f-10cf63223734',6000,1.000),
		('L010','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','9d9141f5-5931-4f5b-adab-d8c61626d8f0',6000,1.000),
		('L011','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','bea392f1-387e-46a7-b8f2-2e7af94f7bcf',6000,1.000),
		('L012','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','a4ed7e67-8989-4a41-b9e6-0f876dafa293',13000,1.000),
		('L013','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','3b4f3a29-e7e8-432e-b751-4dc53908f1f2',120,0.020),
		('L014','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','b474adaf-09ac-48c6-8125-2b2cb5f59cd3',3000,0.500),
		('L015','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','861f17b7-d250-47b4-ac77-583b7ce7ab6d',150,0.025),
		('L016','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','44654a05-0fd5-4253-bb8d-aea624f87484',500,0.083),
		('L017','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','ad6bcb7e-e2e2-4e4a-bf94-bb91bcbd905d',250,0.042),
		('L018','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','2789a663-4f7b-4e4c-95dc-34dc9c6bf210',350,0.058),
		('L019','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','15596404-70b3-4b4d-8244-e070b5cc31a3',6000,1.000),
		('L020','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','f358bfa4-8edb-4f6c-84a3-647a94e8ccec',1500,0.250),
		('L021','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','d1cc1eea-ef95-46d1-9714-989941a83261',6000,1.000),
		('L022','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','0660c4c3-e34b-4a36-80bc-836d63fd1304',6000,1.000),
		('L023','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','749c4ce8-acca-45db-b499-9c3bc833ca61',1000,0.167),
		('L024','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','24e2fa7c-5681-4990-a08b-14073c3d1e78',1500,0.250),
		('L025','e1b53448-3eeb-4229-b0bd-d5838b114b88','48be76b3-d47d-44e6-98e2-c8b10c597bea','33a5fdc9-9324-4c1d-90ac-501977c58702',500,0.083),
		('L026','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','6d4bfc4c-93b6-483b-bc3f-10cf63223734',6482,1.080),
		('L027','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','9d9141f5-5931-4f5b-adab-d8c61626d8f0',28476,4.746),
		('L028','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','8e1c24dd-988a-4f09-9026-8f710f836762',19849,1.527),
		('L029','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','04e3fed5-fd86-4d41-bd18-35e2c25d0ba5',330,0.055),
		('L030','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','729b8776-d67f-4498-8992-12020af494d8',12864,0.990),
		('L031','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','79ce3623-3785-41bf-bf12-d0a9f1f0a426',3805,0.634),
		('L032','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','a4ed7e67-8989-4a41-b9e6-0f876dafa293',1050,0.081),
		('L033','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','e5ab41c6-09e9-4eec-a7ed-ea149fdc6fb4',340,0.057),
		('L034','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','b5870e54-84e5-4900-b853-9948434b9805',226,0.038),
		('L035','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','76547f34-616f-4a20-912d-8118f634b687',226,0.038),
		('L036','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','861f17b7-d250-47b4-ac77-583b7ce7ab6d',64,0.011),
		('L037','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','07b419b9-e5d9-4432-8eb9-86d43c9bd0c5',240,0.040),
		('L038','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','44654a05-0fd5-4253-bb8d-aea624f87484',217,0.036),
		('L039','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','210c0467-bc46-4568-84f4-e653d2a2f414',404,0.067),
		('L040','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','47ea1224-c9fd-4d43-b814-42892141683b',364,0.061),
		('L041','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','0660c4c3-e34b-4a36-80bc-836d63fd1304',2528,0.421),
		('L042','aa49a474-087c-4e71-8977-ba1285032722','1eb31e3e-bad0-4f64-b948-a1cb004bc4c7','749c4ce8-acca-45db-b499-9c3bc833ca61',532,0.089),
		('L043','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','6d4bfc4c-93b6-483b-bc3f-10cf63223734',17890,2.982),
		('L044','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','9d9141f5-5931-4f5b-adab-d8c61626d8f0',63727,10.621),
		('L045','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','04e3fed5-fd86-4d41-bd18-35e2c25d0ba5',2558,0.426),
		('L046','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','bea392f1-387e-46a7-b8f2-2e7af94f7bcf',18436,3.073),
		('L047','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','729b8776-d67f-4498-8992-12020af494d8',1050,0.081),
		('L048','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','79ce3623-3785-41bf-bf12-d0a9f1f0a426',10620,1.770),
		('L049','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','31180c13-a177-4eec-b5ea-246d5cdefb15',240,0.040),
		('L050','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','a4ed7e67-8989-4a41-b9e6-0f876dafa293',40635,3.126),
		('L051','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','97f24d40-f73b-4c4e-99dc-8fb7ec0bb57d',500,0.083),
		('L052','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','b474adaf-09ac-48c6-8125-2b2cb5f59cd3',3800,0.633),
		('L053','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','76547f34-616f-4a20-912d-8118f634b687',286,0.048),
		('L054','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','861f17b7-d250-47b4-ac77-583b7ce7ab6d',64,0.011),
		('L055','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','b750a265-68ce-4fb0-8cdf-4baeb3b2e2de',240,0.040),
		('L056','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','5edfc54a-3dfa-40a5-8ea5-37df93228248',240,0.040),
		('L057','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','ad6bcb7e-e2e2-4e4a-bf94-bb91bcbd905d',643,0.107),
		('L058','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','15596404-70b3-4b4d-8244-e070b5cc31a3',2074,0.346),
		('L059','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','f358bfa4-8edb-4f6c-84a3-647a94e8ccec',597,0.100),
		('L060','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','47ea1224-c9fd-4d43-b814-42892141683b',248,0.041),
		('L061','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','0660c4c3-e34b-4a36-80bc-836d63fd1304',3710,0.618),
		('L062','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','749c4ce8-acca-45db-b499-9c3bc833ca61',516,0.086),
		('L063','49931a72-ee83-44f4-92a0-f73295ec73c0','617f6c4b-7d92-4314-9b4a-01c4b295e05e','5ab268c0-bbc2-45b0-8a85-848e6ef312ca',3730,0.622);

	INSERT INTO issue_1287_part_config
		(part_id, previous_purchase_length_mm, desired_purchase_length_mm, set_periodic)
	SELECT DISTINCT part_id, NULL::integer, 6000, true
	FROM issue_1287_material_repair;

	-- Product confirmed that Booster Pipe is purchased per metre, while these three channel Parts
	-- changed from the legacy 6 m assumption to their actual 13 m purchase length.
	UPDATE issue_1287_part_config
	SET desired_purchase_length_mm = 1000
	WHERE part_id = 'cb61fef6-e462-4f8c-a3e5-cbdd92bbb583';

	UPDATE issue_1287_part_config
	SET previous_purchase_length_mm = 6000,
		desired_purchase_length_mm = 13000
	WHERE part_id IN (
		'8e1c24dd-988a-4f09-9026-8f710f836762',
		'729b8776-d67f-4498-8992-12020af494d8',
		'a4ed7e67-8989-4a41-b9e6-0f876dafa293'
	);

	SELECT count(*) INTO reviewed_count FROM issue_1287_material_repair;
	SELECT count(*) INTO reviewed_config_count FROM issue_1287_part_config;

	-- Keep the reviewed source and purchasing configuration stable between validation and repair.
	PERFORM 1
	FROM "assembly_parts" source
	INNER JOIN issue_1287_material_repair repair
		ON source."assembly_id" = repair.assembly_id
		AND source."part_id" = repair.part_id
	FOR UPDATE OF source;

	PERFORM 1
	FROM "product_assemblies" assembly
	WHERE assembly."id" IN (SELECT assembly_id FROM issue_1287_material_repair)
	FOR UPDATE;

	PERFORM 1
	FROM "parts" part
	WHERE part."id" IN (SELECT part_id FROM issue_1287_material_repair)
	FOR UPDATE;

	PERFORM 1
	FROM "product_material_line" target
	INNER JOIN issue_1287_material_repair repair
		ON target."product_id" = repair.product_id
		AND target."part_id" = repair.part_id
	FOR UPDATE OF target;

	SELECT count(*) INTO keyed_source_count
	FROM issue_1287_material_repair repair
	INNER JOIN "assembly_parts" source
		ON source."assembly_id" = repair.assembly_id
		AND source."part_id" = repair.part_id;

	SELECT count(*) INTO source_count
	FROM issue_1287_material_repair repair
	INNER JOIN "assembly_parts" source
		ON source."assembly_id" = repair.assembly_id
		AND source."part_id" = repair.part_id
		AND source."quantity" = repair.original_quantity;

	SELECT count(*) INTO reviewed_assembly_count
	FROM issue_1287_material_repair repair
	INNER JOIN "product_assemblies" assembly
		ON assembly."id" = repair.assembly_id
		AND assembly."product_id" = repair.product_id;

	SELECT count(*) INTO reviewed_part_count
	FROM issue_1287_material_repair repair
	INNER JOIN "parts" part ON part."id" = repair.part_id;

	SELECT count(*) INTO matching_target_count
	FROM issue_1287_material_repair repair
	INNER JOIN "product_material_line" target
		ON target."product_id" = repair.product_id
		AND target."part_id" = repair.part_id
		AND target."quantity_per_unit" = repair.material_quantity;

	SELECT count(*) INTO conflicting_target_count
	FROM issue_1287_material_repair repair
	INNER JOIN "product_material_line" target
		ON target."product_id" = repair.product_id
		AND target."part_id" = repair.part_id
	WHERE target."quantity_per_unit" <> repair.material_quantity;

	-- A fresh database has none of this production dataset. A fully repaired database has every
	-- reviewed parent and target but no source. Anything between those states is stale data, not a no-op.
	IF keyed_source_count = 0 THEN
		IF reviewed_assembly_count = 0
			AND reviewed_part_count = 0
			AND matching_target_count = 0
			AND conflicting_target_count = 0 THEN
			RETURN;
		END IF;

		IF reviewed_assembly_count = reviewed_count
			AND reviewed_part_count = reviewed_count
			AND matching_target_count = reviewed_count
			AND conflicting_target_count = 0 THEN
			sources_already_repaired := true;
		ELSE
			RAISE EXCEPTION 'Issue #1287 found an incomplete affected dataset with no reviewed Assembly sources';
		END IF;
	END IF;

	IF NOT sources_already_repaired THEN
		IF source_count <> keyed_source_count THEN
			RAISE EXCEPTION 'Issue #1287 found % reviewed Assembly row(s) with changed quantities', keyed_source_count - source_count;
		END IF;

		-- Staging and the development snapshot predate one GG1216 angle-iron row. That known absence is
		-- allowed so every environment converges; any other missing reviewed source still stops the run.
		SELECT count(*) INTO invalid_count
		FROM issue_1287_material_repair repair
		LEFT JOIN "assembly_parts" source
			ON source."assembly_id" = repair.assembly_id
			AND source."part_id" = repair.part_id
		WHERE source."assembly_id" IS NULL
			AND repair.review_id <> 'L014';

		IF invalid_count > 0 THEN
			RAISE EXCEPTION 'Issue #1287 is missing % unexpected reviewed Assembly row(s)', invalid_count;
		END IF;
	END IF;

	IF reviewed_assembly_count <> reviewed_count THEN
		RAISE EXCEPTION 'Issue #1287 found % missing or reassigned reviewed Assembly row(s)', reviewed_count - reviewed_assembly_count;
	END IF;

	IF reviewed_part_count <> reviewed_count THEN
		RAISE EXCEPTION 'Issue #1287 found % missing reviewed Part(s)', reviewed_count - reviewed_part_count;
	END IF;

	IF conflicting_target_count > 0 THEN
		RAISE EXCEPTION 'Issue #1287 found % conflicting Product Material row(s)', conflicting_target_count;
	END IF;

	-- Changing a purchase length changes the meaning of every stored quantity for that Part. The
	-- reviewed rows must remain its only references until this repair runs.
	SELECT count(*) INTO invalid_count
	FROM issue_1287_part_config config
	INNER JOIN "assembly_parts" source ON source."part_id" = config.part_id
	LEFT JOIN issue_1287_material_repair repair
		ON repair.assembly_id = source."assembly_id"
		AND repair.part_id = source."part_id"
	WHERE config.previous_purchase_length_mm IS NOT NULL
		AND repair.review_id IS NULL;

	IF invalid_count > 0 THEN
		RAISE EXCEPTION 'Issue #1287 found % unreviewed Assembly reference(s) to a channel Part changing purchase length', invalid_count;
	END IF;

	SELECT count(*) INTO invalid_count
	FROM issue_1287_part_config config
	INNER JOIN "product_material_line" target ON target."part_id" = config.part_id
	LEFT JOIN issue_1287_material_repair repair
		ON repair.product_id = target."product_id"
		AND repair.part_id = target."part_id"
	WHERE config.previous_purchase_length_mm IS NOT NULL
		AND repair.review_id IS NULL;

	IF invalid_count > 0 THEN
		RAISE EXCEPTION 'Issue #1287 found % unreviewed Product Material reference(s) to a channel Part changing purchase length', invalid_count;
	END IF;

	SELECT reviewed_config_count - count(*) INTO invalid_count
	FROM issue_1287_part_config config
	INNER JOIN "parts" part
		ON part."id" = config.part_id
		AND part."unit_of_measure" = 'mm'
		AND part."standard_purchase_length_mm" IN (
			config.desired_purchase_length_mm,
			coalesce(config.previous_purchase_length_mm, config.desired_purchase_length_mm)
		);

	IF invalid_count > 0 THEN
		RAISE EXCEPTION 'Issue #1287 found % Part(s) outside the reviewed purchasing configuration', invalid_count;
	END IF;

	SELECT count(*) INTO invalid_count
	FROM issue_1287_part_config config
	INNER JOIN "parts" part ON part."id" = config.part_id
	INNER JOIN "stock_movement" movement ON movement."part_id" = config.part_id
	WHERE config.set_periodic
		AND part."stock_tracking_mode" <> 'periodic'
		AND movement."delta" <> 0;

	IF invalid_count > 0 THEN
		RAISE EXCEPTION 'Issue #1287 cannot change tracking mode after % physical stock movement(s)', invalid_count;
	END IF;

	SELECT count(*) INTO invalid_count
	FROM issue_1287_part_config config
	INNER JOIN "parts" part ON part."id" = config.part_id
	INNER JOIN "stock_movement" movement ON movement."part_id" = config.part_id
	WHERE config.previous_purchase_length_mm IS NOT NULL
		AND part."standard_purchase_length_mm" = config.previous_purchase_length_mm
		AND movement."delta" <> 0;

	IF invalid_count > 0 THEN
		RAISE EXCEPTION 'Issue #1287 cannot change a reviewed channel purchase length after % physical stock movement(s)', invalid_count;
	END IF;

	INSERT INTO issue_1287_part_audit_change (part_id, part_name, changes)
	SELECT part."id", part."name",
		CASE
			WHEN part."standard_purchase_length_mm" <> config.desired_purchase_length_mm
			THEN jsonb_build_object(
				'standardPurchaseLengthMm',
				jsonb_build_object(
					'from', part."standard_purchase_length_mm",
					'to', config.desired_purchase_length_mm
				)
			)
			ELSE '{}'::jsonb
		END
		|| CASE
			WHEN config.set_periodic AND part."stock_tracking_mode" <> 'periodic'
			THEN jsonb_build_object(
				'stockTrackingMode',
				jsonb_build_object('from', part."stock_tracking_mode", 'to', 'periodic')
			)
			ELSE '{}'::jsonb
		END
	FROM issue_1287_part_config config
	INNER JOIN "parts" part ON part."id" = config.part_id
	WHERE part."standard_purchase_length_mm" <> config.desired_purchase_length_mm
		OR (config.set_periodic AND part."stock_tracking_mode" <> 'periodic');

	UPDATE "parts" part
	SET "standard_purchase_length_mm" = config.desired_purchase_length_mm
	FROM issue_1287_part_config config
	WHERE part."id" = config.part_id
		AND config.previous_purchase_length_mm IS NOT NULL
		AND part."standard_purchase_length_mm" <> config.desired_purchase_length_mm;

	UPDATE "parts" part
	SET "stock_tracking_mode" = 'periodic'
	FROM issue_1287_part_config config
	WHERE part."id" = config.part_id
		AND config.set_periodic
		AND part."stock_tracking_mode" <> 'periodic';

	INSERT INTO "audit_events" ("entity_type", "entity_id", "action", "summary", "changes")
	SELECT 'part', change.part_id::text, 'updated', 'Updated part "' || change.part_name || '"', change.changes
	FROM issue_1287_part_audit_change change;

	SELECT reviewed_config_count - count(*) INTO invalid_count
	FROM issue_1287_part_config config
	INNER JOIN "parts" part
		ON part."id" = config.part_id
		AND part."standard_purchase_length_mm" = config.desired_purchase_length_mm
		AND (NOT config.set_periodic OR part."stock_tracking_mode" = 'periodic');

	IF invalid_count <> 0 THEN
		RAISE EXCEPTION 'Issue #1287 failed to apply % reviewed Part configuration(s)', invalid_count;
	END IF;

	-- This migration writes around the Product service, so build the same boundary-visible history
	-- before replacing the child rows. Matching targets (GG1216's existing channel line) are not
	-- falsely reported as additions.
	INSERT INTO issue_1287_product_audit_change (product_id, assembly_id, change_key, change)
	SELECT repair.product_id, repair.assembly_id,
		'assemblyPart:' || assembly."name" || ' / ' || part."code",
		jsonb_build_object(
			'from', jsonb_build_object('partId', repair.part_id, 'quantity', repair.original_quantity),
			'to', NULL
		)
	FROM issue_1287_material_repair repair
	INNER JOIN "assembly_parts" source
		ON source."assembly_id" = repair.assembly_id
		AND source."part_id" = repair.part_id
	INNER JOIN "product_assemblies" assembly ON assembly."id" = repair.assembly_id
	INNER JOIN "parts" part ON part."id" = repair.part_id;

	INSERT INTO issue_1287_product_audit_change (product_id, change_key, change)
	SELECT repair.product_id,
		'materialLine:' || part."code",
		jsonb_build_object(
			'from', NULL,
			'to', jsonb_build_object('partId', repair.part_id, 'quantityPerUnit', repair.material_quantity)
		)
	FROM issue_1287_material_repair repair
	INNER JOIN "parts" part ON part."id" = repair.part_id
	LEFT JOIN "product_material_line" target
		ON target."product_id" = repair.product_id
		AND target."part_id" = repair.part_id
	WHERE target."product_id" IS NULL;

	INSERT INTO "product_material_line" ("product_id", "part_id", "quantity_per_unit")
	SELECT product_id, part_id, material_quantity
	FROM issue_1287_material_repair
	ON CONFLICT ("product_id", "part_id") DO NOTHING;

	DELETE FROM "assembly_parts" source
	USING issue_1287_material_repair repair
	WHERE source."assembly_id" = repair.assembly_id
		AND source."part_id" = repair.part_id;

	UPDATE "product_assemblies" assembly
	SET "updated_at" = now()
	WHERE assembly."id" IN (
		SELECT DISTINCT assembly_id
		FROM issue_1287_product_audit_change
		WHERE assembly_id IS NOT NULL
	);

	-- Product children are replaced as one revision by the application, so preserve that revision
	-- boundary when repairing the same children directly.
	UPDATE "products" product
	SET "updated_at" = now()
	WHERE product."id" IN (SELECT DISTINCT product_id FROM issue_1287_product_audit_change);

	INSERT INTO "audit_events" ("entity_type", "entity_id", "action", "summary", "changes")
	SELECT 'product', product."id"::text, 'updated', 'Updated product "' || product."name" || '"',
		jsonb_object_agg(change.change_key, change.change ORDER BY change.change_key)
	FROM issue_1287_product_audit_change change
	INNER JOIN "products" product ON product."id" = change.product_id
	GROUP BY product."id", product."name";

	SELECT reviewed_count - count(*) INTO invalid_count
	FROM issue_1287_material_repair repair
	INNER JOIN "product_material_line" target
		ON target."product_id" = repair.product_id
		AND target."part_id" = repair.part_id
		AND target."quantity_per_unit" = repair.material_quantity;

	IF invalid_count <> 0 THEN
		RAISE EXCEPTION 'Issue #1287 failed to create % reviewed Product Material row(s)', invalid_count;
	END IF;

	SELECT count(*) INTO invalid_count
	FROM issue_1287_material_repair repair
	INNER JOIN "assembly_parts" source
		ON source."assembly_id" = repair.assembly_id
		AND source."part_id" = repair.part_id;

	IF invalid_count > 0 THEN
		RAISE EXCEPTION 'Issue #1287 failed to remove % reviewed Assembly row(s)', invalid_count;
	END IF;
END $$;
