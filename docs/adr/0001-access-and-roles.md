# Access and Roles

App Role is the authorization source. A User has one App Role, and permissions derive from that role's declared permission set. Department Membership is descriptive only: it records which shop area a person belongs to, but it never grants, scopes, or denies access.

Server and API checks are the security boundary. Browser access checks improve navigation and affordances, but every mutation and protected read must still be enforced by the server/API layer.

Each role declares its full permission set explicitly; there is no role inheritance. The current role shape is:

- `super-admin`: every `admin` permission plus exclusive `feedback:read` and `feedback:update`. The only role that can read or manage Feedback (see ADR 0008).
- `admin`: full operational access, including Job creation, Bay scheduling, org calendar updates, Bay administration, and Supplier management. "Full access" no longer means literally every permission — Feedback is deliberately reserved for `super-admin`.
- `procurement-manager`: Customers, Products, Parts, Suppliers, and Job reads, with no Bay scheduling mutation.
- `job-viewer`: Job and Bay schedule reads only.
- `sales`: Quote create/read/update only.
- `bay-operator`: no app permissions.

Only a `super-admin` may assign or remove the `super-admin` role. Although `admin` holds `user:set-role` (and `user:create`/`user:set-password`) and can manage every other role, it must not be able to grant `super-admin` — otherwise an admin could create or promote an account to read Feedback, defeating the rule that admins cannot see Feedback. Role-assignment enforcement therefore treats `super-admin` as a reserved target: granting it, and removing it from another user, requires the actor to already be a `super-admin`.

Roles with no permissions cannot sign in. There is no separate `canLogin` flag on a role or user; granting a role any app permission makes its accounts sign-in eligible unless a new explicit decision changes that.

Bay Operators are attached to Bays through Operator Assignments, not through Department Membership. Changing a user's role while they are attached to Bays must preserve the invariant that only Bay Operators are assigned as Bay Operators.
