import type { ConfigContext, ExpoConfig } from 'expo/config';

// Explicit `.ts` extension: Expo loads this config via Node's type-stripping, which only resolves
// relative imports that carry their extension (extensionless requires don't auto-try `.ts`).
import { resolveAppVariant } from './src/lib/app-variant.ts';

// `newArchEnabled` is a valid runtime field that this Expo version's ExpoConfig types omit.
type AppConfig = ExpoConfig & { newArchEnabled?: boolean };

/**
 * Dynamic Expo config. The static shape (plugins, new arch, typed routes, fonts) lives here; the
 * per-build identity (name, scheme, Android package, icon) is overlaid from {@link resolveAppVariant},
 * selected by `APP_VARIANT`. Keep this a thin shell — the testable logic lives in the resolver.
 */
export default ({ config }: ConfigContext): AppConfig => {
  const variant = resolveAppVariant({ APP_VARIANT: process.env.APP_VARIANT });

  return {
    ...config,
    name: variant.displayName,
    slug: 'jedidiah-ops',
    scheme: variant.scheme,
    // `version` is the human-facing string; EAS owns the Android `versionCode` remotely
    // (`cli.appVersionSource: remote` + per-profile `autoIncrement` in eas.json).
    version: '1.0.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    // Fingerprint runtime version: EAS Update only delivers an OTA bundle to a binary whose native
    // fingerprint matches, so JS-only fixes never land on an incompatible build. The update channel
    // (`staging`/`production`) is set per build profile in eas.json. `eas init` / `eas update:configure`
    // populate `extra.eas.projectId` and `updates.url` on first owner-side setup (see README).
    runtimeVersion: { policy: 'fingerprint' },
    icon: variant.iconConfig.icon,
    plugins: ['expo-router', 'expo-font', '@config-plugins/react-native-pdf', '@config-plugins/react-native-blob-util'],
    experiments: {
      typedRoutes: true,
    },
    android: {
      package: variant.androidPackage,
      adaptiveIcon: variant.iconConfig.adaptiveIcon,
    },
  };
};
