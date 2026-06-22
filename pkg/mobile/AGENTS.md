# mobile (@pkg/mobile)

- Expo managed app using Expo Router and `expo-dev-client`.
- `APP_VARIANT` is required. Variant identity lives in `src/lib/app-variant.ts`; keep
  `app.config.ts` thin and keep its explicit `.ts` resolver import.
- Routes live under `app/`; all other source lives under `src/` and imports through `@/*`.
  Protected routes stay in `app/(protected)/`; `/login` is public.
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
- Native Android launch requires a local Android SDK and Java runtime.
