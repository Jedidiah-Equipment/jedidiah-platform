# api (@pkg/api)

## Copy These

- Thin router: `src/routes/products/products.router.ts`
- Safe full-list router: `src/routes/users/users.router.ts`
- Procedure setup: `src/trpc/init.ts`
- Router composition: `src/trpc/router.ts`
- Direct caller test: `src/routes/products/products.router.test.ts`
- Test harness: `src/test/create-tester.ts`
- Better Auth access wiring: `src/auth/access-control.ts`

## Notes

- Better Auth HTTP endpoints under `/api/auth/*` own auth mutations.
- Keep email mocked unless asked otherwise.
- List inputs use `pageSize: 0` as the repo's unpaged/read-all convention. Prefer that over
  exceeding the shared page-size cap when a UI legitimately needs all rows for a picker.
