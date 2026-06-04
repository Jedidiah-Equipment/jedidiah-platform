# web (@pkg/web)

## Copy These

- Page composition: `src/pages/products/ProductsPage.tsx`
- Create dialog shell: `src/components/form/CreateEntityDialog.tsx`
- Create dialog example: `src/pages/suppliers/SupplierCreateDialog.tsx`
- Autosave edit page example: `src/pages/suppliers/SupplierEditPage.tsx`
- Autosave form example: `src/pages/suppliers/components/SupplierForm.tsx`
- Autosave form utilities: `src/components/form/hooks/use-autosave-form.tsx`,
  `src/components/form/AutosaveStatus.tsx`
- Server-side table: `src/pages/products/components/ProductTable.tsx`
- Client-side table: `src/pages/users/components/UserTable.tsx`
- Shared table renderer: `src/components/data-table/DataTable.tsx`
- Table state helpers: `src/components/data-table/store.ts`
- Form base: `src/components/form/use-app-form.ts`
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
- All React Query invalidation and cache clearing must go through
  `src/hooks/use-query-invalidation.ts`. Use its named base-path invalidators, such as
  `invalidateQuotes` or `invalidateProducts`, instead of calling `queryClient.invalidateQueries`
  directly. Mutations should invalidate the whole affected tRPC root path; cross-entity mutations
  should call each affected root invalidator explicitly.
- For TanStack Form descendants that need form context, use `useTypedAppFormContext` from
  `src/components/form/use-app-form.ts`.
- Prefer `src/components/ui/scroll-area.tsx` `ScrollArea` for page and panel scrolling instead of
  native `overflow-y-auto`.
- Do not test via the browser unless asked.

## Entity forms

Follow ADR 0033 (`docs/adr/0033-create-in-modal-edit-on-autosave-page.md`) for top-level routed
entities: Customer, Product, Supplier, and Quote. Creation happens in a `<CreateEntityDialog>` held
by the list page, and editing happens on the entity edit route with `useAutosaveForm` and
`<AutosaveStatus>`.

The create dialog contains only the schema-required fields needed to create a valid entity. Do not
add a routed `*CreatePage`/`new` route or reuse the full edit form for creation. After a successful
create mutation, close the dialog, invalidate the relevant entity root with `useQueryInvalidation`,
toast once, and navigate to the new entity's edit page.

The edit page owns the full form and has no Save button or edit-mode toggle. Text and number fields
autosave on blur. Selects, checkboxes, date-pickers, and structural operations such as add/remove,
reorder, or toggle save on change. Autosave submits the existing whole-entity update input only when
the whole form is valid, flushes pending changes on leave, and uses the leave guard for failed or
invalid unsaved changes. Surface invalid or failed autosaves through `<AutosaveStatus>` with retry;
do not show success toasts or a positive saved indicator for autosaves.

Nested child entities created inside a parent context are out of scope for this pattern. Part and
Assembly create/edit flows stay as in-context modals unless a future ADR changes that.

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
with their own unit tests; the component imports them. See `src/pages/suppliers/components/` —
`types.ts` (`SupplierFormValues`, `SupplierCreateFormValues`, `toSupplierFormValues`,
`toSupplierMinimalCreateInput`, `toSupplierUpdateInput`), `types.test.ts`, and `SupplierForm.tsx`.
