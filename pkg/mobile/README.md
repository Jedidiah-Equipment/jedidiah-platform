# @pkg/mobile

Expo managed React Native app for JedidiahOps.

## Commands

- `pnpm --filter @pkg/mobile dev` starts Expo for the dev client on port `7003`.
- `pnpm --filter @pkg/mobile dev:staging-api` starts Expo against the staging API.
- `pnpm --filter @pkg/mobile android` builds and launches the Android dev client.
- `pnpm --filter @pkg/mobile android:staging-api` builds and launches Android against the staging API.
- `pnpm --filter @pkg/mobile ios` builds and launches the iOS dev client.
- `pnpm --filter @pkg/mobile ios:staging-api` builds and launches iOS against the staging API.
- `pnpm --filter @pkg/mobile doctor` runs Expo Doctor for the staging variant.
- `pnpm --filter @pkg/mobile typecheck` runs TypeScript for the mobile package.
- `pnpm --filter @pkg/mobile test` runs mobile unit tests.
- `pnpm --filter @pkg/mobile android-eas-build-staging` starts the Android EAS staging build.
- `pnpm --filter @pkg/mobile android-eas-submit-staging` builds and submits the Android EAS staging build.
- `pnpm --filter @pkg/mobile ios-eas-build-staging` starts the iOS EAS staging build.
- `pnpm --filter @pkg/mobile ios-eas-submit-staging` builds and submits the iOS EAS staging build.

## Release

Staging builds use `APP_VARIANT=staging`, package/bundle identifier
`za.co.jedidiahequipment.ops.staging`, and the EAS `staging` channel. EAS Submit uses the platform
credentials stored in Expo for the matching Android package or iOS bundle identifier.
Android submissions send staging builds to Google Play closed testing (`alpha`) and production
builds to the public production track (`production`).

For JS-only OTA fixes:

```sh
cd pkg/mobile
APP_VARIANT=staging EXPO_PUBLIC_APP_ENV=staging EXPO_PUBLIC_API_BASE_URL=https://staging-api.jedidiahequipment.co.za eas update --branch staging --message "..."
```

## Local API

`EXPO_PUBLIC_API_BASE_URL` defaults to `http://10.0.2.2:7002` on Android emulator and
`http://localhost:7002` on iOS simulator/web. For a physical device, point it at the API machine's
LAN URL.

Use `ios:staging-api`, `android:staging-api`, or `dev:staging-api` when you want the local dev
client to authenticate against `https://staging-api.jedidiahequipment.co.za` instead of a local API.

The local Expo dev server runs on `http://localhost:7003`, and staging mobile builds use
`jedidiahopsstaging://`; both must stay in the API's `AUTH_TRUSTED_ORIGINS`.
