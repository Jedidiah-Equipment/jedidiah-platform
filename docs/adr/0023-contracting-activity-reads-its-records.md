# Contracting Activity Reads Its Records, Not the Audit Log

Contracting's **Activity** feed is one ordered stream of what happened and what was said across Jobs and Breakdowns: notes, Breakdowns reported, Mechanics assigned, fixing started and finished, Jobs started, completed and cancelled, Machines arriving on site and leaving. Equipment's Job Activity (ADR 0015) builds the "done" half by projecting `audit_events` through a fixed set of predicates, because Equipment's Job rows carry no stamp for most of the facts the feed reports.

Contracting's records do carry them, or can at the cost of a column: a Breakdown has `reported_at/by`, `started_at/by`, `solved_at/by`; a Job has `completed_at/by` and `cancelled_at/by`; a note has its author and time. We decided that **Contracting Activity reads the entity tables directly**, and that the three facts with no stamp get one rather than a projection: `job.activated_at` / `activated_by_user_id` (stamped in the arrival capture that moves a Job to Active), `breakdown.mechanic_assigned_at` / `mechanic_assigned_by_user_id`, and `hour_reading.created_at` (acceptance time, distinct from the backdatable Read At). Every feed item is one row of one table with a timestamp the table indexes, so the stream is a `UNION ALL` of indexed branches merged by `(occurred_at, id)` under a keyset cursor, with no offset re-scan and no running total.

Audit stays what ADR 0015 made it: `contracting_audit:read`, whole change sets, the `/audit` surface. Notes remain un-audited: they are authored, append-only records that the feed reads as themselves.

## Considered Options

- **Project `audit_events` as Equipment does.** Rejected. Contracting notes are not audited and must never be (an append-only authored record needs no change set), so the feed would be a mixed source anyway; the audit rows for the status transitions carry the facts only inside `changes` jsonb, which no index serves and whose shape a future field rename silently changes; and a foreman's reach (own Jobs, own Breakdowns) is a predicate over the entity tables, not over audit rows.
- **A write-through `contracting.activity` table.** Rejected. One indexed table reads fastest forever, but it is a second copy of every fact, written in every transaction that writes the original, and the Equipment glossary's rule that the feed "stores no duplicate activity records of its own" holds for the same reason here: a feed that disagrees with its records is worse than a slower one.

## Consequences

- Every new feed item kind must come from a stamped column on the record that owns it. A fact with no stamp gets a column, not a predicate.
- The three new columns are facts about the record, usable outside the feed (reports, the Dashboard), and the Audit Log keeps recording the same transitions as before.
- The Equipment feed is unchanged. The two feeds share the client components, the per-business Activity View and the day grouping, not the query.
