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
- Displayed dates must use `@pkg/domain` `formatDate`; do not add one-off
  `Intl.DateTimeFormat`, `toLocaleDateString`, or `toLocaleString` formatting in components.
- Displayed currency values must use `@pkg/domain` `formatCurrency`; do not add one-off
  `Intl.NumberFormat` currency-style formatting in components.
- Shared option-loading hooks belong in `src/hooks/options`. Keep permission-specific endpoints in
  separate hooks with explicit names, for example `useCustomerOptions` for app-level customer reads
  and `useCustomerForQuoteOptions` for quote-scoped customer reads. Do not hide endpoint differences
  behind a generic `source` prop.
- For TanStack Form descendants that need form context, use `useTypedAppFormContext` from
  `src/components/form/use-app-form.ts`.
- Prefer `src/components/ui/scroll-area.tsx` `ScrollArea` for page and panel scrolling instead of
  native `overflow-y-auto`.
- Do not test via the browser unless asked.

## Form validation

`@pkg/schema` owns every field constraint. A form-value schema may define the browser-specific
*shape* (empty strings for null, UI-only flags like `customerMode`, custom messages), but a
per-field *rule* must reference a schema export — no bare `z.string()` where a domain scalar
exists, no inline `.min`/`.email`/`.regex`. When a controlled input needs a different
representation than the API contract, derive it with the helpers in
`src/components/form/form-schema.ts`:

- `emptyStringOr(QuoteNotes)` — nullable field; `''` stands in for absent.
- `requiredSelection(UUID, 'Select a product')` — combobox/select that must resolve to a scalar.

Reserve `superRefine` for genuinely cross-field rules (a check conditional on another field).

Keep the form-value schema and its schema↔form mappers in a `types.ts` beside the component,
with their own unit tests; the component imports them. See `src/pages/quotes/components/` —
`types.ts` (`QuoteFormValues`, `toQuoteFormValues`, `toQuoteCreateInput`), `types.test.ts`, and
`QuoteForm.tsx`.
