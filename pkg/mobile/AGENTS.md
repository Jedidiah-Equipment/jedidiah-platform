# mobile (@pkg/mobile)

- Expo managed app using Expo Router and `expo-dev-client`.
- For every change set that modifies `pkg/mobile`, run
  `pnpm --filter @pkg/mobile version:bump minor` exactly once.
- `APP_VARIANT` is required. Variant identity lives in `src/lib/app-variant.ts`; keep
  `app.config.ts` thin and keep its explicit `.ts` resolver import.
- Routes live under `app/`; all other source lives under `src/` and imports through `@/*`.
  Protected routes stay in `app/(protected)/`; `/login` is public.
- Every signed-in page must use exactly one fixed, edge-to-edge toolbar through its business wrapper
  (`src/equipment/components/TopToolbar.tsx` or `src/contracting/components/TopToolbar.tsx`); both compose
  the business-blind frame in `src/components/TopToolbar.tsx`. `/login` keeps its authentication-specific
  brand header.
  - Main tab pages use `MainTabToolbar`: Jedidiah icon, title and mono subtitle on the left;
    business-specific actions and the profile menu on the right. Equipment exposes its Assistant action
    there when permitted; Contracting currently exposes no Assistant action.
  - Secondary pages use `SecondaryPageToolbar`: an explicit named-parent back action, optional
    avatar, title and mono subtitle on the left; optional badge and profile menu on the right; and
    a bottom border. Never use generic history-only Back behavior.
  - Do not create route-local toolbar variants or add arbitrary toolbar actions. Put page-specific
    actions in page content and expose contextual Help through the profile menu.
- The Jobs, Plan, Units, Products, and Quotes tab roots use the shared full-width card and paginated
  list from `src/equipment/components/CatalogList.tsx`. Do not add per-route catalog card variants or responsive
  card grids there. Detail-page cards are intentionally outside this catalog contract.
- Every page content surface spans the full available width. Horizontal page padding is allowed, but
  do not center page content or cap it with `mx-auto`, `max-w-*`, or equivalent inline styles. This
  rule does not apply to dialogs, drawers, sheets, chat bubbles, or deliberately sized field content.
- Style with NativeWind v4 + gluestack-ui v2 semantic classes. Runtime theme tokens live in
  `src/theme/gluestack-config.ts`; `global.css` is only the NativeWind/Tailwind input.
  Use `cssInterop` for native props that need concrete colors.
- Keep `metro.config.js` and `babel.config.js` thin. `babel-preset-expo` owns the Reanimated
  worklets plugin; do not add that plugin manually.
- Workspace imports should stay lightweight. `@pkg/api` is type-only: import only `AppRouter` with
  `import type` so Metro never bundles the server.
- API reads go through `useTRPC()` / React Query. Native requests attach the better-auth session
  cookie via `getCookie()` in the tRPC link and `authedFetch`.
- Document viewing uses native base files plus `.web` overrides. Native renders PDFs with
  `react-native-pdf`; web fetches authed blobs for iframe/download behavior.
- Root `pnpm verify` covers lint/typecheck/test. Expo release checks are explicit package commands
  such as `pnpm --filter @pkg/mobile doctor` and the Android EAS scripts.
- Upgrade Expo one SDK at a time: bump `expo`, run
  `APP_VARIANT=staging pnpm --filter @pkg/mobile exec expo install --fix`, then keep the resulting
  React version aligned with `@pkg/pdf`. Re-check the version-scoped Worklets extension and keep
  Tailwind 3 and Babel 7 unless their mobile peers support the next majors. The `expo.install.exclude`
  list records packages intentionally tested ahead of Expo's bundled-version metadata; review each
  exception on every SDK move.
- Native Android launch requires a local Android SDK and Java runtime.
