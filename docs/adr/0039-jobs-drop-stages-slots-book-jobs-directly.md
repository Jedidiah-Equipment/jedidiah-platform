# Jobs Drop Stages; Slots Book Jobs Directly

The `job_stage` abstraction is retired. A Job no longer materializes five Stage rows. A **Work Slot** references the **Job** directly (`job_slot.job_id`), and a Slot's Department *is* its Bay's Department — there is no intervening Stage and no Bay/Stage Department-match check. A Job's relationship to a Department is **emergent**: it appears in a Department only while it holds a Slot on one of that Department's Bays. The five-Department Pipeline survives **only** as a display ordering, never as per-Job rows or a work gate.

This **supersedes ADR-0002 and ADR-0010** (both deleted as stage-only noise), **absorbs and retires ADR-0015** (Pipeline-is-advisory — still true, now folded in here and in CONTEXT.md), and **amends ADR-0001**: Department scope retargets from Stage rows onto Bays/Slots — a Department-Aware role is scoped to the Bays of its Departments, and "their Jobs" are the Jobs with a Slot on those Bays. It also refines the "books one Job Stage" anchor language in ADR-0036/0037/0038 to "books one Job."

## Permissions

The `job-stage:read` and `job-stage:update` permissions retire with the Stage abstraction. They are replaced by a single department-scoped **`job:schedule`** permission — "book / resize / remove Work & Idle Slots and edit Bay Calendar Exceptions on Bays in my Department scope." `canEditBaySchedule` is rewritten to check `hasPermission(access, 'job:schedule')` **plus** Department scope, instead of hardcoding the `job-department-manager` role string — so the permission enum once again describes what the role can do, and scheduling authority can later be granted to another role without editing core code. Reading the schedule stays under `job:read` (unscoped). `admin` holds `job:schedule` unscoped; `job-department-manager` holds it scoped to its Departments, with the ADR-0001 empty-set = unscoped footgun intact. `job:update-calendar` (org-wide Off-Days, admin) is unaffected.

## Considered Options

- **Keep Stages as the Slot anchor.** Rejected. `Stage Work State` was never driven (it defaulted to `pending` indefinitely), so the five rows were dead weight; worse, the single Stage-per-Department row was an awkward middleman blocking the wanted model of *several Bays per Department per Job*.
- **Slot → Job, with an explicit `department` column on the Slot.** Rejected. Two sources of truth for a Slot's Department (its column and its Bay) that can drift. Deriving Department purely from the Bay keeps one source of truth and makes "a Job is in a Department" simply mean "it has a Slot on that Department's Bay."
- **Slot → Job, Department derived from the Bay.** Accepted.

## Consequences

- **Schema:** `job_stage` is dropped; `job_slot.job_stage_id` becomes `job_slot.job_id`. The migration is **destructive with no backfill** — the feature is unreleased, so existing seed data is recreated rather than migrated.
- **No Department-match validation.** A Job can be booked onto any Bay in any Department; the Slot simply is whatever-Department work because of where it sits. Nothing stops an "unexpected" Department booking — that is accepted.
- **Per-Department progress is deferred entirely.** There is no Stage record to mark `in-progress`/`complete`. If progress tracking returns, it attaches to Slots/actuals under a new contract, not to resurrected Stage rows.
- **The Job page keeps a five-Department scaffold as a display frame** (Pipeline order), populated by each Department's Bays/Slots for the Job rather than by Stage rows.
- **`job-department-manager` becomes a pure bay-schedule role** — its write surface is booking/resizing/removing Slots and editing Bay Calendar Exceptions on its Departments' Bays; there is no per-Job Stage surface to edit.
- **Audit:** the `job_stage` audit entity retires; admin Bay create/edit/disable is audited under a new `job_bay` entity; Slots stay unaudited.
