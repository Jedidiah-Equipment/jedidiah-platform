/**
 * Build-variant identity for the Expo app. A single `APP_VARIANT` env var selects between a
 * side-by-side `staging` flavour and the reserved `production` flavour; `app.config.ts` overlays
 * the resolved values onto the otherwise-static config. Pure and node-runnable (no Expo/native
 * imports) so it can be unit-tested and evaluated at config time.
 */

/** The build flavours we can ship. `production` is defined but not built in this epic. */
export type AppVariant = 'staging' | 'production';

/** Android adaptive + 1024² icon for a variant. */
export interface IconConfig {
  /** 1024² app icon (iOS / web / fallback). */
  icon: string;
  /** Android adaptive icon: foreground over a solid background colour. */
  adaptiveIcon: {
    foregroundImage: string;
    backgroundColor: string;
  };
}

/** The per-variant identity overlaid onto the static Expo config. */
export interface AppVariantConfig {
  variant: AppVariant;
  androidPackage: string;
  iosBundleIdentifier: string;
  scheme: string;
  displayName: string;
  iconConfig: IconConfig;
}

const PRODUCTION_ICON = './assets/icon.png';
const STAGING_ICON = './assets/icon-staging.png';
const ADAPTIVE_FOREGROUND = './assets/adaptive-icon.png';

// Launcher icons use the bright web/favicon brand yellow.
const ICON_BACKGROUND = '#FFF000';

const VARIANTS: Record<AppVariant, AppVariantConfig> = {
  staging: {
    variant: 'staging',
    androidPackage: 'za.co.jedidiahequipment.ops.staging',
    iosBundleIdentifier: 'za.co.jedidiahequipment.ops.staging',
    scheme: 'jedidiahopsstaging',
    displayName: 'Jedidiah Ops (Staging)',
    iconConfig: {
      icon: STAGING_ICON,
      adaptiveIcon: { foregroundImage: ADAPTIVE_FOREGROUND, backgroundColor: ICON_BACKGROUND },
    },
  },
  production: {
    variant: 'production',
    androidPackage: 'za.co.jedidiahequipment.ops',
    iosBundleIdentifier: 'za.co.jedidiahequipment.ops',
    scheme: 'jedidiahops',
    displayName: 'Jedidiah Ops',
    iconConfig: {
      icon: PRODUCTION_ICON,
      adaptiveIcon: { foregroundImage: ADAPTIVE_FOREGROUND, backgroundColor: ICON_BACKGROUND },
    },
  },
};

/**
 * Resolves the build-variant identity from `env.APP_VARIANT`. Throws on an unknown or missing
 * variant so a misconfigured build fails loudly rather than silently shipping the wrong package
 * name, scheme, or icon.
 */
export function resolveAppVariant(env: { APP_VARIANT?: string }): AppVariantConfig {
  const variant = env.APP_VARIANT;

  if (variant !== 'staging' && variant !== 'production') {
    throw new Error(`Unknown APP_VARIANT ${JSON.stringify(variant)}; expected 'staging' or 'production'.`);
  }

  return VARIANTS[variant];
}
