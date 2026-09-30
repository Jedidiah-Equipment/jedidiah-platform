-- #1584: correct the two active SG1836 Jobs that froze 3000 one-metre pieces instead of three.
-- Deliberate, audited exception to frozen CFO / Job Estimate Snapshot immutability. Not a migration.
-- Rehearse on a fresh local production snapshot, review the output, and obtain production approval.
-- Default is a full rehearsal followed by ROLLBACK. Applying requires -v apply=true.
--
-- psql -X "$DATABASE_URL" -v actor_email=<sign-in-email> \
--   -f pkg/db/scripts/2026-09-30-job-cable-quantity-repair.sql
--
-- Only the named Part on JOB-00096 and JOB-00097 changes. No repricing, ledger writes, catalog changes,
-- or blanket length conversion. Their cable cost was missing, so all frozen totals remain valid floors.

\set ON_ERROR_STOP on
\if :{?apply}
\else
  \set apply false
\endif

begin;
set local lock_timeout = '5s';
set local statement_timeout = '15s';

-- Keep status, catalog identity, stock draws and the frozen rows stable through the guard and update.
lock table equipment.parts, equipment.job, equipment.product_unit, equipment.job_stock_close_out,
  equipment.stock_movement, equipment.job_cfo_assembly, equipment.job_cfo_part,
  equipment.job_estimate_snapshot in share row exclusive mode;

create function pg_temp.assert_count(label text, actual bigint, expected bigint) returns void
language plpgsql as $$
begin
  if actual <> expected then
    raise exception 'Expected % %, found %; repair aborted', expected, label, actual;
  end if;
end $$;

create temp table repair_actor on commit drop as
select id from public."user" where lower(email) = lower(:'actor_email');
select pg_temp.assert_count('users with actor email', (select count(*) from repair_actor), 1);

create temp table repair_jobs (id uuid primary key, code integer) on commit drop;
insert into repair_jobs values
  ('5609b6d2-fd86-473f-922b-5214d5942148', 96),
  ('af315fc2-98d5-4a7b-a49b-c3d7afbcb88d', 97);

select pg_temp.assert_count('active SG1836 Jobs', (
  select count(*) from repair_jobs r
  join equipment.job j on j.id = r.id and j.code = r.code
  join equipment.product_unit u on u.id = j.product_unit_id
  where u.product_id = '49931a72-ee83-44f4-92a0-f73295ec73c0'
    and j.cancelled_at is null and j.completed_on is null
    and not exists (select 1 from equipment.job_stock_close_out c where c.job_id = j.id)
), 2);

select pg_temp.assert_count('expected one-metre perpetual cable Part', (
  select count(*) from equipment.parts
  where id = '79dbc557-994f-4968-9881-f48e4bf0e3bf'
    and code = '2 core electrical cable' and unit_of_measure = 'mm'
    and standard_purchase_length_mm = 1000 and stock_tracking_mode = 'perpetual'
    and not is_internally_fabricated
), 1);

select pg_temp.assert_count('cable stock movements', (
  select count(*) from equipment.stock_movement where part_id = '79dbc557-994f-4968-9881-f48e4bf0e3bf'
), 0);

create temp table repair_cfo on commit drop as
select a.job_id, a.id as assembly_id, p.quantity
from equipment.job_cfo_assembly a join equipment.job_cfo_part p on p.cfo_assembly_id = a.id
join repair_jobs r on r.id = a.job_id
where p.part_id = '79dbc557-994f-4968-9881-f48e4bf0e3bf';

select pg_temp.assert_count('Jobs each with one erroneous CFO line', (
  select count(*) from (
    select job_id from repair_cfo group by job_id having count(*) = 1 and min(quantity) = 3000
  ) matched
), 2);

-- Ordinality locates exactly the affected quantity; jsonb_set preserves every other frozen field.
create temp table repair_estimates on commit drop as
select s.job_id, s.payload as before_payload, p.value as part,
  array['assemblies', (a.ordinality - 1)::text, 'parts', (p.ordinality - 1)::text, 'quantity'] as quantity_path
from equipment.job_estimate_snapshot s join repair_jobs r on r.id = s.job_id
cross join lateral jsonb_array_elements(s.payload->'assemblies') with ordinality a(value, ordinality)
cross join lateral jsonb_array_elements(a.value->'parts') with ordinality p(value, ordinality)
where p.value->>'partId' = '79dbc557-994f-4968-9881-f48e4bf0e3bf';

select pg_temp.assert_count('Jobs each with one erroneous uncosted estimate line', (
  select count(*) from (
    select job_id from repair_estimates group by job_id
    having count(*) = 1 and bool_and(
      part->'quantity' = '3000'::jsonb and part->'unitCost' = 'null'::jsonb
      and part->'costFloor' = '0'::jsonb and part->>'unitOfMeasure' = 'mm'
      and part->'standardPurchaseLengthMm' = '1000'::jsonb
      and before_payload->>'productId' = '49931a72-ee83-44f4-92a0-f73295ec73c0'
      and before_payload->>'scope' = 'build'
    )
  ) matched
), 2);

update equipment.job_cfo_part p set quantity = 3
from repair_cfo r where p.cfo_assembly_id = r.assembly_id
  and p.part_id = '79dbc557-994f-4968-9881-f48e4bf0e3bf';

update equipment.job_estimate_snapshot s
set payload = jsonb_set(r.before_payload, r.quantity_path, '3'::jsonb, false)
from repair_estimates r where s.job_id = r.job_id;

insert into public.audit_events (actor_user_id, entity_type, entity_id, action, summary, changes)
select actor.id, 'job', r.id::text, 'updated',
  'Corrected 2 core electrical cable from 3000 to 3 one-metre pieces in CFO and estimate snapshot (#1584)',
  jsonb_build_object(
    'cfoPartQuantity:79dbc557-994f-4968-9881-f48e4bf0e3bf', jsonb_build_object('from', 3000, 'to', 3),
    'estimatePartQuantity:79dbc557-994f-4968-9881-f48e4bf0e3bf', jsonb_build_object('from', 3000, 'to', 3)
  )
from repair_jobs r cross join repair_actor actor;

select pg_temp.assert_count('corrected CFO lines', (
  select count(*) from equipment.job_cfo_part p join repair_cfo r on r.assembly_id = p.cfo_assembly_id
  where p.part_id = '79dbc557-994f-4968-9881-f48e4bf0e3bf' and p.quantity = 3
), 2);
select pg_temp.assert_count('estimates changed only at the target quantity', (
  select count(*) from equipment.job_estimate_snapshot s join repair_estimates r on r.job_id = s.job_id
  where s.payload = jsonb_set(r.before_payload, r.quantity_path, '3'::jsonb, false)
), 2);

select j.code as job_code, r.quantity as cfo_before, p.quantity as cfo_after,
  e.before_payload #> e.quantity_path as estimate_before, s.payload #> e.quantity_path as estimate_after,
  s.payload->'totalCostFloor' as unchanged_total_cost_floor
from repair_cfo r join equipment.job_cfo_part p on p.cfo_assembly_id = r.assembly_id
join repair_estimates e on e.job_id = r.job_id
join equipment.job_estimate_snapshot s on s.job_id = r.job_id
join repair_jobs j on j.id = r.job_id
where p.part_id = '79dbc557-994f-4968-9881-f48e4bf0e3bf'
order by j.code;

\if :apply
  commit;
\else
  rollback;
\endif
