# web (@pkg/web)

- Browser access checks are UX only; the server/API is the authorization boundary.
- Login is email/password only unless asked otherwise.
- Use `@pkg/domain` `formatDate` and `formatCurrency`; do not add one-off `Intl` or locale formatting in components.
- Route all React Query invalidation through `src/hooks/use-query-invalidation.ts`; invalidate whole affected tRPC root paths.
- Use shared UI primitives for standard surfaces: `Card` composition from `src/components/ui/card.tsx` and `ScrollArea` for page/panel scrolling.
- For TanStack Form descendants, use `useTypedAppFormContext` from `src/components/form/use-app-form.ts`.
- Keep `vite.config.ts` `resolve.dedupe: ['react', 'react-dom']`. `pkg/mobile` pins a different React version than web; without deduping a second React copy leaks into the bundle and breaks hooks ("Invalid hook call" / `useRef` of null). If you still see that error after a branch switch, clear the stale Vite cache (`rm -rf node_modules/.vite`) and restart the dev server.

## Entity Forms

- Top-level entities create in a `<CreateEntityDialog>` owned by the list page, then navigate to the edit route.
- Edit pages own the full form, autosave without a Save button or edit-mode toggle, flush on leave, and surface invalid/failed autosaves through `<AutosaveStatus>` without success toasts.
- Nested child entities stay in-context unless a new decision says otherwise.

## Validation

- `@pkg/schema` owns field rules. Form-value schemas may define browser shape and messages, but per-field constraints must reference schema exports.
- Use helpers from `src/components/form/form-schema.ts` for UI/API shape bridges such as nullable strings and required selections.
- Keep complex form mappers in a nearby `types.ts` with unit tests.

Canonical examples: `src/pages/products/ProductsPage.tsx`, `src/pages/suppliers/SupplierCreateDialog.tsx`, `src/pages/suppliers/SupplierEditPage.tsx`, `src/pages/suppliers/components/types.ts`.
