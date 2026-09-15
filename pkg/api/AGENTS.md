# api (@pkg/api)

- Keep routers thin: auth, input parsing, transport mapping, and calls into `@pkg/core`.
- Better Auth endpoints under `/api/auth/*` own auth mutations; do not reimplement them in tRPC.
- Map expected core errors at the feature boundary with public messages and stable `appCode`s. Preserve the core error as `cause`.
- List inputs use `limit: 0` for unpaged picker reads instead of exceeding shared caps.
- `Auth` is injected, never imported: HTTP routes read `request.server.auth`, tRPC reads `ctx.auth`, tests get it
  from the tester scope. `app-auth.ts` is root wiring; shared modules must not import it.
- A router that needs a runtime service (the catalog translation scheduler) is a factory, composed in
  `trpc/router.ts` by `createAppRouter(dependencies)`.
- Role slots travel as `data.equipmentRole` / `data.contractingRole` on Better Auth create-user and update-user,
  and as `role` on set-role; `auth/role-slots.ts` parses them for every hook and remaps them onto the columns.
  Business plugins (`equipment/auth/admin-user-safety.ts`, `contracting/auth/driver-role-safety.ts`) only add
  policy. After a Better Auth upgrade, rerun `admin-user-safety.test.ts` and `driver-role-safety.test.ts`, which
  exercise `role-slots.ts` through the real endpoints.

Canonical examples: `src/routes/equipment/products/products.router.ts`, `src/trpc/init.ts`, `src/test/create-tester.ts`.
