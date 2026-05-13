# Authorization Architecture

Status: v1 product/user authorization slice implemented

This document defines how the app models roles, permissions, and authorization across the database,
shared packages, API, and web app.

The current authorization slice is intentionally narrow: products and user role management. The app
uses Better Auth for identity, session cookies, and global role storage. Application permissions are
defined as typed capabilities and enforced in tRPC/API procedures. The dashboard is the authenticated
landing page and is intentionally not permissioned. The web app mirrors feature checks only for
navigation and user experience.

## Research Notes

- Better Auth Admin plugin supports app-level user administration, global role assignment, banning,
  impersonation, custom access-control roles, and server/client permission checks. See
  [Better Auth Admin plugin](https://better-auth.com/docs/plugins/admin).
- Better Auth Organization plugin supports membership-scoped roles, organizations, teams,
  invitations, and dynamic organization roles. It remains deferred until the product needs tenant or
  customer-account scoped access. See
  [Better Auth Organization plugin](https://better-auth.com/docs/plugins/organization).
- OWASP authorization guidance remains the baseline: least privilege, deny by default, validate
  permissions on every request, enforce server-side, and test authorization rules. See
  [OWASP Authorization Cheat Sheet](https://cheatsheetseries.owasp.org/cheatsheets/Authorization_Cheat_Sheet.html).
- RBAC is still a good fit for this slice. The NIST model maps cleanly to users, roles, and
  permissions; future object-level rules can layer resource attributes on top. See
  [NIST RBAC](https://csrc.nist.gov/Projects/role-based-access-control/faqs).

## V1 Role Model

Use static global roles plus typed capabilities. Do not add custom app-owned `roles`,
`permissions`, or role-permission join tables for this slice.

Permissions:

```txt
product:read
product:create
product:update
user:list
user:edit
```

Roles:

```txt
admin
  product:read
  product:create
  product:update
  user:list
  user:edit

product-editor
  product:read
  product:create
  product:update

product-viewer
  product:read
```

New users default to `product-viewer`. The first `admin` is assigned manually or through seed data;
the app does not promote the first signed-up user automatically.

## Layer Responsibilities

### Database

- Better Auth owns users, sessions, accounts, verification rows, and Admin plugin fields.
- The `user` table stores the global role in `role`, defaulting to `product-viewer`.
- Admin plugin fields live on Better Auth tables: `user.banned`, `user.ban_reason`,
  `user.ban_expires`, and `session.impersonated_by`.
- The database stores assignments and facts; code owns the default policy matrix.
- Migrations are generated with `pnpm db:generate`, reviewed, and committed with schema changes.

### Schema

`@pkg/schema` defines the cross-package authorization contract:

- `AppRole`, `APP_ROLES`, and `DEFAULT_APP_ROLE`
- `AppPermission` and `APP_PERMISSIONS`
- `UserAccessSummary`, with one public `role` plus derived permissions
- `hasPermission`, the shared helper for checking a permission in an access summary
- `UserSummary`, `UserListResult`, and `UserSetRoleInput`

The schema package validates boundary data. It does not own the role-to-permission matrix.

### Core

`@pkg/core` owns pure authorization policy:

- `authorizationStatement`
- `appRoleAccess`
- `normalizeAppRoles`
- `getRolePermissions`
- `createUserAccessSummary`

Unknown or missing roles normalize to no access. This keeps authorization deny-by-default even if a
stored role is invalid. Better Auth can store multiple roles, so policy helpers still tolerate that
shape internally, but the app exposes a single `role` in `UserAccessSummary` for the v1 user model.

### API

The API is the enforcement authority.

- tRPC context loads the Better Auth session and derives `ctx.access`.
- `protectedProcedure` requires a signed-in session.
- `authorizedProcedure(permission)` requires both a session and the named app permission.
- Dashboard access is covered by authentication only, not by `authorizedProcedure`.
- Product procedures are gated by `product:read`, `product:create`, and `product:update`.
- User procedures are gated by `user:list` and `user:edit`.
- `users.setRole` accepts only v1 roles, rejects changing the current user's own role, and rejects
  removing the last admin.
- Durable audit logging for role changes remains future work.
- Anonymous requests return `UNAUTHORIZED`; signed-in users without permission return `FORBIDDEN`.

App feature routers should not call Better Auth directly by default. Auth state enters app code
through tRPC context and focused authorization helpers.

### Web

The web app uses permissions for UX only.

- `auth.access` returns the current `UserAccessSummary`.
- Sidebar items and product controls are hidden when the user lacks the matching permission.
- Products are visible to all v1 roles because all v1 roles include `product:read`.
- Product creation is visible only with `product:create`.
- Product editing is visible only with `product:update`.
- The Users nav item is visible only with `user:list`; directly visiting the Users page relies on
  the API returning `FORBIDDEN` for unauthorized data access.
- Server-side API checks remain the security boundary.
- Admin plugin fields for bans and impersonation are schema plumbing only until app policy and UI
  explicitly use them.

## Deny-By-Default Rules

- A route/procedure is public only if it uses `publicProcedure`.
- A signed-in-only route/procedure uses `protectedProcedure`.
- A permissioned route/procedure uses `authorizedProcedure`.
- New capabilities grant no access until a role explicitly includes them.
- New roles grant no access until capabilities are explicitly assigned.
- Client checks never replace API checks.

## Future Expansion

Use Better Auth Organization plugin later if the product needs:

- multiple companies, branches, or customer accounts in one deployment
- customer portal users
- membership-scoped roles
- invitations or teams
- runtime-editable roles per organization

When that happens, tenant access should move toward organization membership roles. Global app roles
can still exist for platform staff.

Future workflow permissions should keep the same capability pattern, such as `quote:create` or
`job-stage:update-status`. Contextual rules like assignment, status, or customer ownership should
live in API/service resource checks rather than exploding role names.
