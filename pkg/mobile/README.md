# @pkg/mobile

Expo managed React Native app for JedidiahOps. See [AGENTS.md](AGENTS.md) for code conventions.

## Commands

All are `pnpm --filter @pkg/mobile <script>`:

- `dev` — Expo for the dev client on port `7003`; `android` / `ios` build and launch the native dev client
- `dev:staging-api`, `android:staging-api`, `ios:staging-api` — the same, authenticating against
  `https://staging-api.jedidiahequipment.co.za` instead of a local API
- `doctor` — Expo Doctor for the staging variant
- `typecheck`, `test`
- `android-eas-build-staging` / `ios-eas-build-staging` and the matching `…-eas-submit-staging` scripts

## Local API

`EXPO_PUBLIC_API_BASE_URL` defaults to `http://10.0.2.2:7002` on the Android emulator and
`http://localhost:7002` on the iOS simulator and web. For a physical device, point it at the API machine's
LAN URL.

The Expo dev server runs on `http://localhost:7003` and staging builds use `jedidiahopsstaging://`; both
must stay in the API's `AUTH_TRUSTED_ORIGINS`.

## Release

Staging builds use `APP_VARIANT=staging`, identifier `za.co.jedidiahequipment.ops.staging`, and the EAS
`staging` channel. EAS Submit uses the platform credentials stored in Expo for the matching Android package
or iOS bundle identifier. Android sends staging builds to Google Play closed testing (`alpha`) and
production builds to the `production` track.

JS-only OTA fix:

```sh
cd pkg/mobile
APP_VARIANT=staging EXPO_PUBLIC_APP_ENV=staging EXPO_PUBLIC_API_BASE_URL=https://staging-api.jedidiahequipment.co.za eas update --branch staging --message "..."
```
