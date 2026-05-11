# Authorization Architecture

Status: proposed

This document defines how the app should model roles, permissions, and authorization across the database, shared packages, API, and web app.

The short version: keep the old "roles linked to use cases" idea, but rename use cases to **capabilities** and make them a typed, reviewed policy surface. Better Auth remains the authentication and session authority. App authorization is enforced at the API/service layer and mirrored in the web app only for navigation and UX.

## Research Notes

- Better Auth has a first-class Admin plugin for app-level user administration, role assignment, banning, impersonation, and role permission checks. It adds a `role` field to `user` and supports checking permissions from the server or client. See [Better Auth Admin plugin](https://better-auth.com/docs/plugins/admin).
- Better Auth also has an Organization plugin for membership-scoped roles, organization permissions, invitations, teams, and optional dynamic role definitions stored in an `organizationRole` table. See [Better Auth Organization plugin](https://better-auth.com/docs/plugins/organization).
- OWASP's authorization guidance is still the right baseline: least privilege, deny by default, validate permissions on every request, enforce server-side, and test authorization rules. See [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
- The RBAC idea is not dated. NIST's model still maps cleanly to users, roles, and permissions. What is dated is using roles as the only question. Modern apps should combine role permissions with resource attributes such as ownership, assignment, status, stage, or organization. See [NIST RBAC](https://csrc.nist.gov/Projects/role-based-access-control/faqs).

## Recommendation

Use **static app roles plus typed capabilities** for the first production slice.

Do not build bespoke `roles`, `usecases`, and join tables yet. The policy matrix should live in versioned code first, because these permissions are product behavior, need code review, and should be tested with the procedures they protect.

Use Better Auth's Admin plugin for app-level role assignment and user administration when we implement this. Configure it with custom access control roles generated from our shared capability statement.

Delay Better Auth's Organization plugin unless the product needs customer tenants, separate companies, branch-level membership, or runtime role customization. If those needs appear, prefer the Organization plugin and its dynamic access control over a custom role/usecase schema.

## Terms

```txt
User
  Authenticated Better Auth user.

Role
  Named job/access bundle assigned to a user, such as admin, sales, production, procurement, or viewer.

Capability
  A typed permission statement describing what the app allows, such as quote:create or job-stage:update.

Policy
  The role-to-capability matrix plus resource-level rules.

Resource rule
  A contextual check using object data, such as assigned_to_user_id, status, customer_id, or production_stage_id.
```

Use "capability" in app code and docs. It is more precise than "usecase" and maps directly to Better Auth's resource/action access-control shape.

## Policy Shape

Capabilities should be resource/action pairs:

```ts
const authorizationStatement = {
  dashboard: ["read"],
  customer: ["read", "create", "update", "archive"],
  quote: ["read", "create", "update", "approve", "convert"],
  job: ["read", "create", "update", "cancel"],
  jobStage: ["read", "assign", "updateStatus"],
  procurement: ["read", "create", "update", "approve"],
  product: ["read", "create", "update", "archive"],
  user: ["read", "create", "updateRole", "ban"],
} as const;
```

Roles grant capabilities:

```txt
admin
  Everything, including user administration.

manager
  Broad read/write across commercial and operations workflows, limited user administration.

sales
  Customers, quotes, and quote-to-job conversion.

production
  Jobs and production stages.

procurement
  Procurement workflows and job read access.

viewer
  Read-only dashboard and assigned operational views.
```

These names are placeholders. Before implementation, define the first real role matrix from the screens and workflows in `docs/prototype-domain-erd.md`.

## Layer Responsibilities

### Database Layer

Database responsibilities:

- Persist Better Auth users, sessions, accounts, verification rows, and plugin-owned role fields.
- Persist app-owned domain records with user references such as `created_by_user_id`, `assigned_to_user_id`, and `changed_by_user_id`.
- Persist audit events for role changes and sensitive authorization-relevant mutations once those workflows exist.
- Enforce referential integrity where domain tables reference Better Auth users.

Recommended first implementation:

- Add Better Auth Admin plugin fields to `pkg/db/src/schema/auth.ts`: `role`, `banned`, `banReason`, `banExpires`, and `session.impersonatedBy`, following Better Auth's Drizzle schema expectations.
- Keep role assignment on the Better Auth-owned `user` table for now.
- Do not add app-owned `roles`, `permissions`, or `role_permissions` tables until there is a real runtime-editable role requirement.

Important database boundaries:

- The database stores assignments and facts; code owns the default policy matrix.
- Domain tables should not store duplicated authorization decisions such as `can_edit`.
- Object-level facts should be queryable: creator, assignee, customer, stage, status, archived state, and ownership boundaries.
- SQL migrations must be generated through `pnpm db:generate`, reviewed, and committed with schema changes.

### Schema Layer

`@pkg/schema` should stay lightweight and framework-independent.

Schema responsibilities:

- Define Zod schemas for role slugs and capability query inputs/outputs that cross package boundaries.
- Define serialized user-access summaries returned by app APIs.
- Avoid importing Better Auth, Drizzle, Fastify, React, or direct `process.env`.

Likely shapes:

```ts
RoleSlugSchema
CapabilityResourceSchema
CapabilityActionSchema
UserAccessSummarySchema
```

The schema package should not own the policy matrix. It should validate data at boundaries.

### Core Layer

`@pkg/core` should own pure authorization policy and checks.

Core responsibilities:

- Define the canonical authorization statement.
- Define app role slugs.
- Define the role-to-capability matrix.
- Provide pure helpers such as `roleHasCapability`, `rolesHaveCapability`, `normalizeRoles`, and `canAccessNavigationItem`.
- Provide pure resource-rule helpers where the rule can be expressed without database or framework imports.

Keep the Better Auth adapter thin:

- Option A: build Better Auth `ac` and role objects directly in `@pkg/core` using `better-auth/plugins/access`.
- Option B: export plain statement/matrix objects from `@pkg/core`, then build Better Auth `ac` objects in `pkg/api` and `pkg/web`.

Prefer Option B if we want `@pkg/core` to remain completely vendor-neutral. Prefer Option A if Better Auth's access-control types are valuable enough to share directly. Either path is acceptable, but do not duplicate the policy matrix in both API and web.

### API Layer

The API is the enforcement authority.

API responsibilities:

- Load the Better Auth session in tRPC context.
- Attach a normalized access summary to context: user ID, roles, and a capability checker.
- Provide authorization middleware next to `protectedProcedure`, such as `authorizedProcedure({ quote: ["create"] })`.
- Enforce resource-level rules in services after loading the target row.
- Return `UNAUTHORIZED` when there is no session and `FORBIDDEN` when the user is signed in but lacks access.
- Log denied access for sensitive workflows without leaking private record details to the client.

Recommended procedure pattern:

```ts
export const createQuote = authorizedProcedure({
  quote: ["create"],
})
  .input(CreateQuoteInputSchema)
  .mutation(({ ctx, input }) => quoteService.create(ctx.authz, input));
```

Recommended service pattern:

```ts
const quote = await quoteRepository.findById(input.quoteId);

assertCan(ctx.authz, { quote: ["update"] });
assertCanUpdateQuoteResource(ctx.authz, quote);
```

The first check answers "does this role have the capability?" The second answers "does this user have access to this object in this state?"

App modules should not call Better Auth directly by default. Better Auth remains behind `auth/`, tRPC context, and focused authorization helpers.

### Web Layer

The web app may hide, disable, or redirect for UX, but it is not the security boundary.

Web responsibilities:

- Use session/access summary data from Better Auth and app tRPC queries.
- Filter sidebar items, route links, buttons, and dashboard cards based on capabilities.
- Use route `beforeLoad` checks for coarse redirects such as unauthenticated users or users with no dashboard access.
- Render "not allowed" states when server responses return `FORBIDDEN`.
- Avoid embedding privileged assumptions into client-only logic.

Recommended web pattern:

```ts
const canCreateQuote = useCan({ quote: ["create"] });
```

Use this for presentation only. The API must repeat the check.

## Better Auth Plugin Decision

### Use Admin Plugin First

Use Better Auth Admin plugin when we implement app roles because:

- This app currently looks like a single-company operational platform.
- Roles are global job/access bundles, not yet scoped to customer tenants or separate organizations.
- The plugin already supports role assignment and permission checks.
- It fits the current Better Auth-owned user table.

Configure custom access control rather than relying only on built-in `admin` and `user` roles.

### Add Organization Plugin Later If Needed

Add Better Auth Organization plugin if the product needs:

- Multiple companies or branches in one deployment.
- Customer portal users who belong to customer accounts.
- Membership-scoped roles, invitations, or teams.
- Runtime-editable roles per organization.

If this happens, role assignment moves from global `user.role` toward organization membership roles. Global app roles may still exist for platform staff, but tenant access should be membership-scoped.

## Deny-By-Default Rules

- A route/procedure is public only if it uses `publicProcedure`.
- A signed-in-only route/procedure uses `protectedProcedure`.
- A permissioned route/procedure uses `authorizedProcedure`.
- New capabilities grant no access until a role explicitly includes them.
- New roles grant no access until capabilities are explicitly assigned.
- Client checks never replace API checks.

## Object-Level Rules

Role capabilities are necessary but not always sufficient.

Examples:

```txt
jobStage:updateStatus
  Allowed for production roles, but service rules may require the user to be assigned to the stage or have manager override.

quote:update
  Allowed for sales roles, but service rules may block updates after approval unless the user has quote:approve or manager override.

customer:read
  Allowed broadly for internal staff now, but a future customer portal would require customer membership or relationship checks.
```

Do not create roles like `sales_can_edit_draft_quotes_but_not_approved_quotes`. Keep the role capability simple and put status/ownership checks in resource rules.

## Testing Strategy

Core tests:

- Every role has exactly the expected capabilities.
- Unknown roles normalize to no access.
- New capability additions require explicit role matrix decisions.

API tests:

- Unauthenticated requests return `UNAUTHORIZED`.
- Authenticated users without capability return `FORBIDDEN`.
- Users with capability pass the procedure-level check.
- Resource-level denials are covered for ownership, assignment, archived state, and status transitions.

Web tests:

- Navigation hides inaccessible entries.
- Forbidden server responses render useful blocked states.
- Route guards redirect unauthenticated users without treating client checks as final authority.

## Migration Path

1. Define the first capability statement and role matrix in an architecture PR.
2. Add Better Auth Admin plugin fields to the Drizzle schema.
3. Generate and review SQL migrations.
4. Add shared authorization helpers.
5. Add `authorizedProcedure` and API tests.
6. Update `auth.me` or a new `auth.access` query to return a user access summary.
7. Gate sidebar and first workflows in the web app.
8. Add audit logging around role changes and sensitive denied attempts.

## Open Questions

- Are all users internal Jedidiah staff in the first release, or will customers log into the same app?
- Are roles assigned globally, or does access vary by branch, department, customer account, or team?
- Should managers have override capabilities, or should override be a separate role/capability?
- Which workflows are read-only for shop-floor users versus editable?
- Should role changes require audit notes or approval?

Until those answers change the shape, the tightest pattern is static typed app capabilities, Better Auth Admin role assignment, API-centered enforcement, and resource rules for contextual decisions.
