# @pkg/mobile

Expo managed React Native app for Jedidah Ops.

## Scripts

- `pnpm --filter @pkg/mobile start` starts Expo for the dev client.
- `pnpm --filter @pkg/mobile android` builds and launches the Android dev client.
- `pnpm --filter @pkg/mobile ios` builds and launches the iOS dev client.
- `pnpm --filter @pkg/mobile check` runs TypeScript for the mobile package.

## Notes

- Expo Router owns navigation under `app/`.
- The app currently redirects `/` to `/login`.
- Styling uses React Native `StyleSheet` and shared tokens from `src/theme.ts`.
- Metro uses Expo's default pnpm monorepo support through `expo/metro-config`.
- This package is intentionally not part of root `pnpm verify` yet.
