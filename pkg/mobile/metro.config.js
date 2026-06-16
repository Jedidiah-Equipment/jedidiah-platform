const { getDefaultConfig } = require('expo/metro-config');

// Expo SDK 52+ auto-detects pnpm workspaces; keep this thin so Metro owns monorepo resolution.
const config = getDefaultConfig(__dirname);

module.exports = config;
