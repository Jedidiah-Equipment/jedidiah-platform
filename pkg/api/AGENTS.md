# api (@pkg/api)

- Keep routers thin: auth, input parsing, transport mapping, and calls into `@pkg/core`.
- Better Auth endpoints under `/api/auth/*` own auth mutations; do not reimplement them in tRPC.
- Map expected core errors at the feature boundary with public messages and stable `appCode`s. Preserve the core error as `cause`.
- List inputs use `pageSize: 0` for unpaged picker reads instead of exceeding shared caps.

Canonical examples: `src/routes/products/products.router.ts`, `src/trpc/init.ts`, `src/test/create-tester.ts`.
