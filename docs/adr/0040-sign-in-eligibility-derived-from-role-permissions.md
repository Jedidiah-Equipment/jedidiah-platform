# Sign-in eligibility is derived from role permissions

A role whose permission set is empty cannot sign in: sign-in is rejected and existing sessions are denied at the session/access-summary layer. There is no `canLogin` flag on roles or users — we rejected both a per-role flag (a second axis that would always mirror "has permissions") and reusing better-auth's per-user `banned` flag (per-user state that drifts on role changes and misuses discipline semantics). The current role set has no permissionless roles, but this remains the policy if one is introduced again.

## Consequences

- Granting any empty role its first permission silently enables sign-in for every account holding that role. This is a side effect to be aware of when editing `appRoleAccess`.
- If a future role ever needs permissions without login (e.g. API-only), this rule no longer suffices and an explicit flag becomes necessary.
