const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

// Expo SDK 52+ auto-detects pnpm workspaces; keep this thin so Metro owns monorepo
// resolution. NativeWind only needs the global.css entry wired in.
const config = getDefaultConfig(__dirname);

module.exports = withNativeWind(config, { input: './global.css' });
