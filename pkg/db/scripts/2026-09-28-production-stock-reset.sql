-- Production reset before the stocktake (#1569, signed off by product on the issue).
--
-- Clears every Purchase Order and the whole stock ledger so the count starts from nothing, then carries
-- each costed Part's moving average over on one zero-quantity opening balance, so the count lands at
-- today's cost instead of "No cost yet".
--
-- Goes: every Stock Movement, Build and stocktake session; every Purchase Order with its lines, Custom
-- Line arrivals, amendments and Job links; every document filed against a Purchase Order with the
-- extractions, flag resolutions and credit-note settlements behind it. The files stay in object storage.
-- Stays: Parts, Suppliers, Jobs, Quotes, Products, Units and their documents, Job close-outs, audit
-- history, and Purchase Order numbering, which carries on from where it is.
--
-- Not a migration. One transaction that aborts unless the table counts match the ones signed off on the
-- issue, and the actor email names exactly one user. Rehearse on staging against a fresh production
-- snapshot, take a Railway backup, then run against production:
--
--   psql -X "$DATABASE_URL" \
--     -v actor_email=<Dean's sign-in email> \
--     -v expected_stock_movements=<n> -v expected_purchase_orders=<n> \
--     -v expected_purchase_order_documents=<n> -v expected_stocktake_sessions=<n> \
--     -v expected_stock_builds=<n> \
--     -f pkg/db/scripts/2026-09-28-production-stock-reset.sql
--
-- Never replace the deletes with `TRUNCATE ... CASCADE` on Purchase Orders: documents reference them,
-- and the cascade would take every Job, Quote and Product document with it.

\set ON_ERROR_STOP on

begin;

-- Holds every writer off until commit, so the counts checked below are the rows deleted. Taken in the
-- writers' own order (the Part row, then the Purchase Order row, then what hangs off them) so a receipt
-- caught mid-write finishes first instead of deadlocking against the reset.
lock table
  equipment.parts,
  equipment.purchase_order,
  equipment.stock_movement,
  equipment.stock_build,
  equipment.stocktake_session,
  equipment.purchase_order_line,
  equipment.purchase_order_line_arrival,
  equipment.purchase_order_amendment,
  equipment.purchase_order_job_link,
  equipment.documents,
  equipment.invoice_extraction,
  equipment.invoice_flag_resolution,
  equipment.credit_note_settlement
in exclusive mode;

create function pg_temp.assert_count(label text, actual bigint, expected bigint) returns void
language plpgsql as $$
begin
  if actual <> expected then
    raise exception 'Expected % %, found %; nothing was changed', expected, label, actual;
  end if;
end $$;

select pg_temp.assert_count('stock movements', (select count(*) from equipment.stock_movement), :'expected_stock_movements');
select pg_temp.assert_count('purchase orders', (select count(*) from equipment.purchase_order), :'expected_purchase_orders');
select pg_temp.assert_count(
  'purchase order documents',
  (select count(*) from equipment.documents where owner_type = 'purchase_order'),
  :'expected_purchase_order_documents'
);
select pg_temp.assert_count('stocktake sessions', (select count(*) from equipment.stocktake_session), :'expected_stocktake_sessions');
select pg_temp.assert_count('builds', (select count(*) from equipment.stock_build), :'expected_stock_builds');

create temp table reset_actor on commit drop as
select id from "user" where lower(email) = lower(:'actor_email');

select pg_temp.assert_count('users with the actor email', (select count(*) from reset_actor), 1);

-- `deriveMovingAverageTimeline` (@pkg/domain) replayed in double precision, the arithmetic the app
-- itself reads costs with, over the same ledger order `loadMovingAverages` (@pkg/core) uses. Linear
-- Parts come out per millimetre.
create function pg_temp.moving_averages()
returns table (part_id uuid, average_unit_cost double precision)
language plpgsql as $$
declare
  movement record;
  current_part uuid;
  average double precision;
  on_hand double precision;
  basis_quantity double precision;
  cost_per_basis_unit double precision;
  previous_quantity double precision;
  next_quantity double precision;
begin
  for movement in
    select
      m.part_id,
      m.movement_type,
      m.reason,
      m.delta::double precision as delta,
      m.length_mm::double precision as length_mm,
      m.unit_cost::double precision as unit_cost
    from equipment.stock_movement m
    order by m.part_id, m.created_at, m.id
  loop
    if current_part is distinct from movement.part_id then
      if current_part is not null then
        part_id := current_part;
        average_unit_cost := average;
        return next;
      end if;
      current_part := movement.part_id;
      average := null;
      on_hand := 0;
    end if;

    if movement.movement_type = 'revaluation' then
      average := movement.unit_cost;
      continue;
    end if;

    basis_quantity := movement.delta * coalesce(movement.length_mm, 1);

    if movement.unit_cost is not null and (
      movement.movement_type in ('receipt', 'return-to-store', 'build-produce')
      or (movement.movement_type = 'adjustment' and movement.reason = 'opening-balance')
    ) then
      cost_per_basis_unit := case
        when movement.length_mm is null then movement.unit_cost
        else movement.unit_cost / movement.length_mm
      end;
      previous_quantity := greatest(0, on_hand);
      next_quantity := previous_quantity + basis_quantity;

      if average is null or previous_quantity = 0 or next_quantity <= 0 then
        average := cost_per_basis_unit;
      else
        average := (previous_quantity * average + basis_quantity * cost_per_basis_unit) / next_quantity;
      end if;
    end if;

    on_hand := on_hand + basis_quantity;
  end loop;

  if current_part is not null then
    part_id := current_part;
    average_unit_cost := average;
    return next;
  end if;
end $$;

create temp table carried_cost on commit drop as
select part_id, average_unit_cost from pg_temp.moving_averages() where average_unit_cost is not null;

-- Settlements and flag resolutions reference movements; movements reference builds, sessions, PO lines
-- and each other (a linked return names its checkout), so every movement goes in one statement.
delete from equipment.credit_note_settlement;
delete from equipment.invoice_flag_resolution;
delete from equipment.stock_movement;
delete from equipment.stock_build;
delete from equipment.stocktake_session;
delete from equipment.purchase_order_line_arrival;
-- Cascades to lines, Job links, amendments and Purchase Order documents with their extractions.
delete from equipment.purchase_order;

-- A linear Part's opening balance names its standard length and prices the piece, the shape the
-- adjustment dialog posts, so the replay divides back down to the same cost per millimetre. Built Parts
-- are carried too, although the app refuses a keyed cost on one: this is the cost their builds derived,
-- not a new price, and without it every Product using them would go uncosted.
insert into equipment.stock_movement (actor_user_id, delta, length_mm, movement_type, note, part_id, reason, unit_cost)
select
  actor.id,
  0,
  part.standard_purchase_length_mm,
  'adjustment',
  'Cost carried over on reset 2026-09-28',
  part.id,
  'opening-balance',
  cost.average_unit_cost * coalesce(part.standard_purchase_length_mm, 1)
from carried_cost cost
join equipment.parts part on part.id = cost.part_id
cross join reset_actor actor;

select pg_temp.assert_count('purchase orders left', (select count(*) from equipment.purchase_order), 0);
select pg_temp.assert_count(
  'stock movements left beside the carried costs',
  (select count(*) from equipment.stock_movement),
  (select count(*) from carried_cost)
);

select count(*) as carried_costs from carried_cost;

commit;
