# Jedidiah Contracting Lives in This Platform, Behind a Symmetric Namespace Wall

Jedidiah Equipment and Jedidiah Contracting are separate businesses under one owner, with separate
staff and — the owner is explicit — no gray area between them in the product. Contracting is
getting its own application surface (job cards, machine hours, breakdowns, servicing). The question
this ADR settles is where that application lives: inside this platform, or as its own repo,
services, and database.

We decided **contracting is built into this platform** — one repo, one API/web/mobile deployment,
one database — **behind a symmetric namespace wall**. The platform serves two businesses, and the
codebase says so everywhere the same way:

- **Folders.** Every layer package namespaces by business: `pkg/core/src/equipment/…` and
  `pkg/core/src/contracting/…`, `pkg/api/src/routes/equipment/…` and
  `pkg/api/src/routes/contracting/…`, likewise `pkg/domain`, web routes, and mobile route groups.
  Anything outside both namespaces is **shared infrastructure by definition** — auth, db client,
  UI kit, files, theme, formatting, AI, audit. That absence-means-shared rule is the point of
  symmetry: with only a `contracting/` namespace, "outside" would ambiguously mean equipment *or*
  shared, and the boundary could not be linted from both sides.
- **Database.** Two named Postgres schemas, `equipment` and `contracting`, via Drizzle `pgSchema`.
  `public` stays the shared home because that is where better-auth and tooling defaults already
  point; only the two businesses get named schemas. The classification principle for phase 0:
  `public` holds only **business-blind mechanism** — user/auth, changelog, the stored-file blob
  store. A table whose *rows* attach to business entities is business-scoped even when its
  mechanism looks shared: feedback and documents reference equipment Jobs, Quotes, Products, and
  Purchase Orders today, so they move into the `equipment` schema (contracting grows its own
  counterparts if it ever needs them). The one deliberate spanning table is `audit_events` — one
  audit mechanism serves both businesses, every row is business-attributable through the entity it
  records, and that attributability is a phase-0 invariant, not an accident. Cross-schema foreign
  keys into `public` are ordinary; foreign keys *between* `equipment` and `contracting` do not
  exist at all.
- **URLs.** `/equipment/…` and `/contracting/…`, so the mode is visible in every address and deep
  links are unambiguous. Legacy paths (`/jobs`, `/inventory`, …) permanently redirect.
- **Permissions.** One flat App Role set and one `resource:verb` grammar, with symmetric families:
  `equipment_job:read`, `contracting_job:read`, `contracting_machine:update`. Contingency: if
  phase 0 finds permission strings persisted anywhere (audit rows, stored config), equipment names
  stay bare and this ADR gains the exception.
- **Access.** A user holds up to two role slots — an equipment role and a contracting role — and
  business access is derived from role presence (the roles decision refined the originally
  stored `business` field into this derivation). Only users with both slots filled (a handful of
  principals) see the mode switcher; everyone else experiences a single-business app. One
  `super-admin` role spans the split. Server-side checks remain the security boundary, as ever.
- **Vocabulary.** Two bounded contexts under a root `CONTEXT-MAP.md`: the existing glossary
  becomes the Equipment context, contracting gets its own, and the map holds the shared concepts
  and collision rules (an unqualified "Job" means the context you are standing in; crossing
  contexts you say Equipment Job / Contracting Job). The codename "JedConOps" does not survive
  into code or UI: the app remains JedidiahOps and the modes display as Jedidiah Equipment and
  Jedidiah Contracting.

**The wall is enforced, not reviewed.** A lint boundary rule fails CI when equipment code imports
from `contracting/` or contracting code imports from `equipment/`; both may import shared
infrastructure. App wiring (route registry, root router, navigation shell) is the one place both
namespaces are named together. The businesses share nothing beyond the business-blind mechanisms
in `public`: the fleet-model decision dropped the once-considered Machine → Product Unit link, so
no row in either business schema references the other.

**The exit is designed in**, in two grades. The likely one is **discontinuation** (the owner's
own read): the retired business's schema is dropped, its users lose that access as the `business`
field collapses to one value, and the switcher retires — `public` stays put, nothing is
extracted. The stronger one is **departure**: the leaving business takes its schema dump *plus a
filtered slice of `public`* — its users (duplicating the handful of `both` users into both
worlds), their auth rows, the stored-file blobs its schema's rows reference, and its
`audit_events` rows via the attributability invariant above. A schema dump alone is deliberately
not the story: business-blind mechanism still gets *referenced* by business rows, so the exit is
"schema + filtered shared slice," and what phase 0's classification principle protects is that
the filter stays expressible — every `public` row either serves all businesses identically or is
attributable through what references it.

**Phase 0 precedes any contracting code.** The symmetric standard is set by moving the existing
equipment mass — folders, routes with redirects, `ALTER TABLE … SET SCHEMA equipment` (an atomic
metadata change), permission renames, seed snapshot regeneration, template DB rebuild, blame-noise
mitigation via `.git-blame-ignore-revs` — as behavior-preserving migration work before the first
contracting table lands. Contracting arrives into a codebase that already says `equipment/`
everywhere, rather than defining the pattern by exception.

## Considered Options

- **Fully standalone app (own repo, services, database)** — rejected. For a solo maintainer it
  near-doubles the operated surface (second deploy pipeline, second auth, second Expo store
  listing, duplicated fixes to shared machinery like PDF rendering) as a permanent tax, purchased
  against a business split the owner calls unlikely and worthless to sell into. The designed exit
  above buys the same insurance for a fraction of the cost.
- **Same monorepo, separate services and database** — rejected for the same operational tax minus
  the code duplication: it still doubles the deploy stack, auth realm, and mobile app, and the
  handful of cross-business principals would juggle two logins. Its one real advantage — a hard
  data wall — is substantially recovered by the named-schema split and the lint boundary.
- **Asymmetric namespace (only `contracting/` marked, existing code left in place)** — rejected
  after real consideration; it avoids the phase-0 churn but leaves "outside the namespace" meaning
  equipment-or-shared, which cannot be linted from both directions and would let shared
  infrastructure and equipment domain code keep bleeding into each other unmarked.
- **Sharing the Customer directory across businesses** — rejected; the overlap (a farmer who buys
  equipment and hires contracting) is small, invoicing is already separate per entity, and a
  shared directory is exactly the gray area the owner refused — plus an entanglement the exit
  would have to unpick. Each business keeps its own customer table and tolerates the odd
  duplicate.
- **One shared machine identity (contracting fleet as Product Units)** — rejected; a Product Unit
  is defined by its Build Job, while the contracting fleet is overwhelmingly bought equipment the
  plant never built. Forcing one identity would grow equipment's model a "bought" origin for
  another business's benefit. An optional Machine → Product Unit link for the built minority was
  considered next and dropped by the fleet-model decision as speculative — a machine equipment
  built is still just a Machine on the contracting side.
