# mobile (@pkg/mobile)

- This package is an Expo managed React Native app using Expo Router and `expo-dev-client`.
- Keep routing file-based under `app/`; the initial app should open through `app/index.tsx` to `/login`.
- Use plain React Native `StyleSheet` plus tokens from `src/theme.ts`; do not add NativeWind or a component framework unless explicitly asked.
- Keep `metro.config.js` thin and based on `expo/metro-config`; Expo owns pnpm workspace resolution in current SDKs.
- Workspace imports are allowed, but prefer lightweight, framework-independent packages such as `@pkg/schema`.
- `@pkg/mobile` is intentionally outside root `pnpm verify`; use targeted checks such as `pnpm --filter @pkg/mobile check` and Expo commands.
- Native Android launch requires a local Android SDK and Java runtime.
