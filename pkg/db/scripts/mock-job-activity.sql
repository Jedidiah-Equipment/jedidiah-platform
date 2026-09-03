-- Mock Job change events for the local Job Activity feed.
--
-- The seed snapshot carries feedback but no audit_events, so a local feed shows only speech bubbles.
-- This fills in the four change events the feed curates (ADR 0015) — created, description changed and
-- cleared, completed, document added — with and without an actor, spread across days that do and do
-- not already carry feedback, so every shape the timeline draws is on screen at once.
--
-- Local only, and safe to re-run: it clears its own rows first. `pnpm db:seed` wipes them.
--
--   docker exec -i jedidiah-platform-postgres-1 psql -U postgres -d jedidiah < pkg/db/scripts/mock-job-activity.sql

begin;

delete from audit_events where summary like '%[mock]';

with job_ref as (
  select code::int as code, id, completed_on from equipment.job
),
actor as (
  select name, id from "user"
),
event (code, at, action, entity, actor_name, changes) as (
  values
    -- Today: a day that already carries feedback, so bubbles and change events interleave.
    (65, timestamptz '2026-08-17 15:40+02', 'created', 'job',      'Braam Pretorius', null::jsonb),
    (64, timestamptz '2026-08-17 14:05+02', 'updated', 'job',      'Dean van Niekerk',
      '{"description":{"from":null,"to":"Fit the heavy-duty boom and re-torque the axle bolts before handover."}}'),
    (63, timestamptz '2026-08-17 11:20+02', 'created', 'document', 'Dewald Van Niekerk',
      '{"filename":{"from":null,"to":"torque-spec-sheet.pdf"},"contentType":{"from":null,"to":"application/pdf"},"metadata":{"from":null,"to":{"type":"general"}}}'),
    (63, timestamptz '2026-08-17 09:05+02', 'updated', 'job',      null,
      '{"completedOn":{"from":null,"to":"2026-08-14"}}'),

    -- Yesterday: no feedback of its own, so the day reads as change events alone.
    (62, timestamptz '2026-08-16 16:30+02', 'updated', 'job',      null,
      '{"completedOn":{"from":null,"to":"2026-08-14"}}'),
    (62, timestamptz '2026-08-16 13:15+02', 'updated', 'job',      'Dean van Niekerk',
      '{"description":{"from":"Paint bay handover pending.","to":null}}'),
    (61, timestamptz '2026-08-16 10:50+02', 'created', 'document', 'Jed van Niekerk',
      '{"filename":{"from":null,"to":"delivery-note-JOB-00061.pdf"},"contentType":{"from":null,"to":"application/pdf"},"metadata":{"from":null,"to":{"type":"delivery_note"}}}'),
    (60, timestamptz '2026-08-16 08:40+02', 'created', 'job',      'Andile', null),

    (59, timestamptz '2026-08-15 14:20+02', 'updated', 'job',      'Athulile ',
      '{"completedOn":{"from":null,"to":"2026-08-13"}}'),
    (58, timestamptz '2026-08-15 11:10+02', 'updated', 'job',      'Ayanda',
      '{"description":{"from":null,"to":"Customer asked for the spare-wheel carrier to move to the near side."}}'),
    (57, timestamptz '2026-08-15 09:30+02', 'created', 'job',      'Bonginkosi', null),

    (56, timestamptz '2026-08-14 16:10+02', 'updated', 'job',      null,
      '{"completedOn":{"from":null,"to":"2026-08-12"}}'),
    (55, timestamptz '2026-08-14 12:45+02', 'created', 'document', 'Dewald Van Niekerk',
      '{"filename":{"from":null,"to":"hydraulic-test-certificate.pdf"},"contentType":{"from":null,"to":"application/pdf"},"metadata":{"from":null,"to":{"type":"general"}}}'),
    (54, timestamptz '2026-08-14 08:15+02', 'created', 'job',      'Dean van Niekerk', null),

    (53, timestamptz '2026-08-13 15:05+02', 'updated', 'job',      'Braam Pretorius',
      '{"completedOn":{"from":null,"to":"2026-08-13"}}'),
    (52, timestamptz '2026-08-13 10:35+02', 'updated', 'job',      'Jed van Niekerk',
      '{"description":{"from":"Standard build.","to":"Standard build, but ship with the wide-track axle."}}'),

    (51, timestamptz '2026-08-11 13:50+02', 'updated', 'job',      null,
      '{"completedOn":{"from":null,"to":"2026-08-11"}}'),
    (50, timestamptz '2026-08-11 09:12+02', 'created', 'job',      'Andile', null)
)
insert into audit_events (occurred_at, actor_user_id, entity_type, entity_id, action, summary, changes)
select
  event.at,
  actor.id,
  event.entity,
  -- A document event is keyed to the document; the feed reads its Job out of the snapshot instead.
  case when event.entity = 'document' then gen_random_uuid()::text else job_ref.id::text end,
  event.action,
  format(
    '%s %s "%s" [mock]',
    case event.action when 'created' then 'Created' else 'Updated' end,
    case event.entity when 'document' then 'Document' else 'Job' end,
    case
      when event.entity = 'document' then event.changes -> 'filename' ->> 'to'
      else 'JOB-' || lpad(event.code::text, 5, '0')
    end
  ),
  case
    when event.entity = 'document'
      then event.changes || jsonb_build_object('jobId', jsonb_build_object('from', null, 'to', job_ref.id))
    when event.action = 'created'
      then jsonb_build_object('code', jsonb_build_object('from', null, 'to', event.code::text))
    else event.changes
  end
from event
join job_ref on job_ref.code = event.code
left join actor on actor.name = event.actor_name;

commit;
