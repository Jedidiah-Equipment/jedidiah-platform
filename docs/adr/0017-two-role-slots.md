# Access Is Two Role Slots per User; App Role Stays the Authorization Source

Supersedes ADR 0001 (deleted), whose one-role-per-user shape predates the platform serving two
businesses (ADR 0016). Everything durable in it is restated here under the current model.

**A User holds up to two role slots — an equipment role and a contracting role — and business
access is role presence.** A user with only an equipment role never sees Jedidiah Contracting; a
user with both slots filled sees the mode switcher. No stored `business` field exists to disagree
with the roles. Within each business, App Role remains the single authorization source:
permissions derive from the held role's declared permission set, each role declares that set
explicitly, and there is no role inheritance. Department Membership stays descriptive only — it
never grants, scopes, or denies access.

Server and API checks are the security boundary. Browser access checks improve navigation and
affordances, but every mutation and protected read is enforced server-side, and that enforcement
includes the business boundary itself: holding no contracting role means no contracting read or
write, whatever the equipment slot holds.

**`super-admin` spans the split**: one role, above both businesses, filling both slots by
definition — every permission in both plus user administration. It remains a reserved target:
although `admin` holds `user:set-role` and manages every other role, granting `super-admin`, or
removing it from another user, requires the actor to already be a `super-admin` (the Feedback
escalation path ADR 0010 closes).

The equipment role shape carries over from ADR 0001 unchanged: `admin` (full operational access,
less what is reserved to `super-admin`), `procurement-manager`, `job-manager`, `job-viewer`,
`sales`, `stores`, and `bay-operator` (no permissions), with the Inventory v1 permission grants as
previously recorded. The contracting role shape: `contracting-admin` (every contracting
permission `super-admin` has — Pricing and Preset Rates included — without user administration),
`contracting-manager` (all operations, no Pricing or Preset Rates), `workshop-manager` (reads all
contracting; writes breakdowns and servicing), `foreman` (own jobs, captures readings, reports
breakdowns, sees no money), and `contracting-invoicing` (reads Priced/Completed Job Cards, stamps
the Invoice Number). `driver` and `mechanic` are permissionless contracting roles for people who
appear in pickers and history but never sign in — the bay-operator pattern.

Sign-in eligibility generalizes the ADR 0001 rule: there is no `canLogin` flag; a user may sign
in when any held role grants any app permission, so a user whose only roles are permissionless
(bay-operator, driver, mechanic) cannot. Bay Operators remain attached to Bays through Operator
Assignments, never Department Membership, and role changes must preserve that only Bay Operators
hold Bay assignments.

## Considered Options

- **Keep one role per user** — rejected; the handful of cross-business principals would each need
  a bespoke role bundling two businesses' permissions, and the mode switcher could not be derived
  from anything principled.
- **A stored `business` field beside the role** (ADR 0016's original sketch) — superseded; a
  stored field can disagree with the roles that actually gate access, and role presence already
  says everything the field did.
- **Per-business super-admins** — rejected; the owner and the maintainer genuinely span both
  businesses, and two top roles would double the reserved-grant machinery for no boundary gain.
