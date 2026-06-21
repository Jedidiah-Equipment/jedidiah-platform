# @pkg/mobile

Expo managed React Native app for Jedidiah Ops.

## Scripts

- `pnpm --filter @pkg/mobile dev` starts Expo for the dev client on port `7003`.
- `pnpm --filter @pkg/mobile android` builds and launches the Android dev client.
- `pnpm --filter @pkg/mobile ios` builds and launches the iOS dev client.
- `pnpm --filter @pkg/mobile typecheck` runs TypeScript for the mobile package.

## Notes

- Expo Router owns navigation under `app/`. Source lives under `src/` and is imported via the `@/*` alias.
- Auth is gated once in `app/(protected)/_layout.tsx`: it shows a loading state while the
  session resolves, redirects to `/login` when there is none, and exposes the resolved
  session via `useAuthSession` so protected screens can assume it. `login` is the public route.
- Styling uses NativeWind v4 + gluestack-ui v2 via `className`. Theme tokens are CSS variables
  in `global.css` mapped to semantic classes in `tailwind.config.js`; color mode follows the OS
  with a persisted override in `src/theme/ColorModeProvider.tsx`. See `AGENTS.md` for the rules.
- Metro uses Expo's default pnpm monorepo support through `expo/metro-config`.
- Linted/formatted by root Biome (`pnpm lint`), but outside the heavy `pnpm verify` steps
  (typecheck/build/test) because those need the Expo/native toolchain.

## Local API

Mobile auth calls the API root from `EXPO_PUBLIC_API_BASE_URL`. It defaults to
`http://10.0.2.2:7002` on Android, which reaches the host machine from the Android
emulator. On iOS simulator and web it defaults to `http://localhost:7002`.
The local Expo dev server runs on `http://localhost:7003`, which must stay in the
API's `AUTH_TRUSTED_ORIGINS` for browser-based mobile development.

For a physical device, set `EXPO_PUBLIC_API_BASE_URL` to a LAN URL for the machine
running the API, for example `http://192.168.1.20:7002`.

To exercise the seeded happy path locally, run:

```sh
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm --filter @pkg/api dev
```
