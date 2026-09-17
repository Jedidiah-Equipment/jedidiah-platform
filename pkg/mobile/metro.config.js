const { withNativeWind } = require('nativewind/metro');
const { getPostHogExpoConfig } = require('posthog-react-native/metro');

// Expo SDK 52+ auto-detects pnpm workspaces; keep this thin so Metro owns monorepo
// resolution. NativeWind only needs the global.css entry wired in.
const config = getPostHogExpoConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
