# Access and Roles

App Role is the authorization source. A User has one App Role, and permissions derive from that role's declared permission set. Department Membership is descriptive only: it records which shop area a person belongs to, but it never grants, scopes, or denies access.

Server and API checks are the security boundary. Browser access checks improve navigation and affordances, but every mutation and protected read must still be enforced by the server/API layer.

The current role shape is:

- `admin`: full application access, including Job creation, Bay scheduling, org calendar updates, Bay administration, and Supplier management.
- `procurement-manager`: Customers, Products, Parts, Suppliers, and Job reads, with no Bay scheduling mutation.
- `job-viewer`: Job and Bay schedule reads only.
- `sales`: Quote create/read/update only.
- `bay-operator`: no app permissions.

Roles with no permissions cannot sign in. There is no separate `canLogin` flag on a role or user; granting a role any app permission makes its accounts sign-in eligible unless a new explicit decision changes that.

Bay Operators are attached to Bays through Operator Assignments, not through Department Membership. Changing a user's role while they are attached to Bays must preserve the invariant that only Bay Operators are assigned as Bay Operators.
