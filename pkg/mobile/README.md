# @pkg/mobile

Expo managed React Native app for Jedidah Ops.

## Scripts

- `pnpm --filter @pkg/mobile start` starts Expo for the dev client.
- `pnpm --filter @pkg/mobile android` builds and launches the Android dev client.
- `pnpm --filter @pkg/mobile ios` builds and launches the iOS dev client.
- `pnpm --filter @pkg/mobile check` runs TypeScript for the mobile package.

## Notes

- Expo Router owns navigation under `app/`.
- The app redirects unauthenticated launches to `/login` and shows a minimal signed-in placeholder at `/`.
- Styling uses React Native `StyleSheet` and shared tokens from `src/theme.ts`.
- Metro uses Expo's default pnpm monorepo support through `expo/metro-config`.
- This package is intentionally not part of root `pnpm verify` yet.

## Local API

Mobile auth calls the API root from `EXPO_PUBLIC_API_BASE_URL`. It defaults to
`http://10.0.2.2:7002` on Android, which reaches the host machine from the Android
emulator. On iOS simulator and web it defaults to `http://localhost:7002`.

For a physical device, set `EXPO_PUBLIC_API_BASE_URL` to a LAN URL for the machine
running the API, for example `http://192.168.1.20:7002`.

To exercise the seeded happy path locally, run:

```sh
pnpm db:up && pnpm db:migrate && pnpm db:seed
pnpm --filter @pkg/api dev
```
