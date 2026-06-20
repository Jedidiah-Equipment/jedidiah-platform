# mobile (@pkg/mobile)

- This package is an Expo managed React Native app using Expo Router and `expo-dev-client`.
- Keep routing file-based under `app/`; the initial app should open through `app/index.tsx` to `/login`.
- Style with NativeWind v4 + gluestack-ui v2 via `className`; do not branch on the color scheme in JS to pick colours. Use semantic classes (`bg-background`, `text-foreground`, `border-border`, `text-primary-foreground`, ...). For props that need a concrete colour (e.g. a spinner), use `cssInterop` to drive them from a class rather than reading a scheme.
- Theme tokens live as CSS variables in `global.css` (`:root` light, `.dark:root` dark); `tailwind.config.js` maps semantic class names to them. Add or change colours there, then reference them by class. Keep the palette aligned with web `pkg/web/src/styles/globals.css`.
- Color mode follows the OS via NativeWind, with a persisted light/dark/system override in `src/theme/ColorModeProvider.tsx` (AsyncStorage — works on native and web; `expo-secure-store` has no web support) that calls `setColorScheme`. `GluestackUIProvider` is mounted in `app/_layout.tsx`; screens get styles through the `import '../global.css'` there.
- Placeholder colour uses NativeWind's `placeholder:text-*` variant; it moves `color` to `placeholderTextColor` at runtime, so the Tailwind IntelliSense "cssConflict" warning against a sibling `text-*` is a false positive (the repo sets that lint to `ignore`).
- Keep `metro.config.js` thin: `expo/metro-config` wrapped once with `withNativeWind`. Expo owns pnpm workspace resolution in current SDKs. `babel.config.js` must keep `babel-preset-expo` (it auto-adds the Reanimated worklets plugin) — do not add that plugin manually.
- Workspace imports are allowed, but prefer lightweight, framework-independent packages such as `@pkg/schema`.
- `@pkg/mobile` is intentionally outside root `pnpm verify`; use targeted checks such as `pnpm --filter @pkg/mobile check` and Expo commands.
- Native Android launch requires a local Android SDK and Java runtime.
