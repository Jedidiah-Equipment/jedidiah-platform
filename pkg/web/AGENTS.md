# web (@pkg/web)

Follow `../../.sandcastle/CODING_STANDARDS.md`.

## Copy These

- Page composition: `src/pages/products/ProductsPage.tsx`
- Server-side table: `src/pages/products/components/ProductTable.tsx`
- Client-side table: `src/pages/users/components/UserTable.tsx`
- Shared table renderer: `src/components/data-table/DataTable.tsx`
- Table state helpers: `src/components/data-table/store.ts`
- Forms: `src/components/form/use-app-form.ts`
- Access helpers: `src/hooks/use-access.ts`, `src/lib/access.ts`
- Route guard example: `src/routes/_authed.users.tsx`

## Notes

- Browser access checks are UX only; the server is the authorization boundary.
- Login is email/password only unless asked otherwise.
- Displayed dates must use `src/utils/date.ts` `formatDate`; do not add one-off
  `Intl.DateTimeFormat`, `toLocaleDateString`, or `toLocaleString` formatting in components.
- Do not test via the browser unless asked.
