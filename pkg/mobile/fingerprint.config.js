// The store version is bumped on every mobile change set, but it is a label, not native code. Hashing
// it would strand every JS-only OTA update on the builds already installed, so native changes alone
// move the runtime version. `1` is `SourceSkips.ExpoConfigVersions` (`version`, `android.versionCode`,
// `ios.buildNumber`); `@expo/fingerprint` is not a direct dependency, so pnpm will not resolve it here.
/** @type {import('@expo/fingerprint').Config} */
module.exports = {
  sourceSkips: 1,
};
