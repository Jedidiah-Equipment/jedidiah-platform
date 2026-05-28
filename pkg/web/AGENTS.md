# web (@pkg/web)

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
- Displayed currency values must use `src/utils/number.ts` `formatCurrency`; do not add one-off
  `Intl.NumberFormat` currency-style formatting in components.
- Shared option-loading hooks belong in `src/hooks/options`. Keep permission-specific endpoints in
  separate hooks with explicit names, for example `useCustomerOptions` for app-level customer reads
  and `useCustomerForQuoteOptions` for quote-scoped customer reads. Do not hide endpoint differences
  behind a generic `source` prop.
- For TanStack Form descendants that need form context, use `useTypedAppFormContext` from
  `src/components/form/use-app-form.ts`. Prefer form value schemas from `@pkg/schema` when their
  input/output types match the browser form state. When a form needs a browser-specific value shape,
  define that form schema alongside the form component, and keep shared validation rules in
  `@pkg/schema` as reusable helpers instead of duplicating them in web.
- Prefer `src/components/ui/scroll-area.tsx` `ScrollArea` for page and panel scrolling instead of
  native `overflow-y-auto`.
- Do not test via the browser unless asked.
