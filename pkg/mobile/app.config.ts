import type { ConfigContext, ExpoConfig } from 'expo/config';

// Explicit `.ts` extension: Expo loads this config via Node's type-stripping, which only resolves
// relative imports that carry their extension (extensionless requires don't auto-try `.ts`).
import { resolveAppVariant } from './src/lib/app-variant.ts';

// Two plugins write each of these Info.plist keys; one sentence per key keeps the last writer from winning.
const CAMERA_PERMISSION =
  'Allow $(PRODUCT_NAME) to scan Part labels and stores badges, and photograph hour meters and Field Note evidence, with the camera.';
const PHOTOS_PERMISSION =
  'Allow $(PRODUCT_NAME) to choose meter photos from, and save Field Note photos to, your photo library.';
const MICROPHONE_PERMISSION =
  'Allow $(PRODUCT_NAME) to record voice notes, which it turns into text, with the microphone.';

const LOCATION_PERMISSION = 'Allow $(PRODUCT_NAME) to record where a breakdown was reported.';

// `newArchEnabled` is a valid runtime field that this Expo version's ExpoConfig types omit.
type AppConfig = ExpoConfig & { newArchEnabled?: boolean };

/**
 * Dynamic Expo config. The static shape (plugins, new arch, typed routes, fonts) lives here; the
 * per-build identity (name, scheme, native package identifiers, icon) is overlaid from
 * {@link resolveAppVariant}, selected by `APP_VARIANT`. Keep this a thin shell — the testable
 * logic lives in the resolver.
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
    version: '1.76.0',
    orientation: 'portrait',
    userInterfaceStyle: 'automatic',
    newArchEnabled: true,
    // Fingerprint runtime version: EAS Update only delivers an OTA bundle to a binary whose native
    // fingerprint matches, so JS-only fixes never land on an incompatible build. The update channel
    // (`staging`/`production`) is set per build profile in eas.json. `eas init` / `eas update:configure`
    // populate `extra.eas.projectId` and `updates.url` on first owner-side setup (see README).
    runtimeVersion: { policy: 'fingerprint' },
    icon: variant.iconConfig.icon,
    plugins: [
      'expo-router',
      'expo-font',
      'expo-localization',
      ['posthog-react-native/expo', { skipOnConflict: true }],
      // The stores tablet's camera fallback for a damaged Part label (spec §10), and Contracting's hour
      // meter photographs. Both ask for the permission only when the operator opens the camera.
      ['expo-camera', { cameraPermission: CAMERA_PERMISSION, microphonePermission: MICROPHONE_PERMISSION }],
      // Field Note photos and gallery meter photos; the system picker itself needs no library grant.
      [
        'expo-image-picker',
        { cameraPermission: CAMERA_PERMISSION, photosPermission: PHOTOS_PERMISSION, microphonePermission: false },
      ],
      // Saves camera-taken Field Note photos to the Jedidiah album, photos only.
      [
        'expo-media-library',
        {
          photosPermission: PHOTOS_PERMISSION,
          savePhotosPermission: PHOTOS_PERMISSION,
          isAccessMediaLocationEnabled: false,
          granularPermissions: [],
        },
      ],
      // Contracting voice notes: press-and-hold recording, turned into text by the API.
      ['expo-audio', { microphonePermission: MICROPHONE_PERMISSION }],
      // Contracting breakdown reports attach the phone's position when the reporter allows it; foreground only.
      // The Always keys stay because the module's binary references those APIs and App Store upload flags a
      // missing purpose string, which would cost another store build to fix.
      [
        'expo-location',
        {
          locationWhenInUsePermission: LOCATION_PERMISSION,
          locationAlwaysAndWhenInUsePermission: LOCATION_PERMISSION,
          locationAlwaysPermission: LOCATION_PERMISSION,
          isIosBackgroundLocationEnabled: false,
          isAndroidBackgroundLocationEnabled: false,
        },
      ],
      // Workshop pushes. The icon, colour and default channel are native: changing them moves the fingerprint.
      ['expo-notifications', { icon: './assets/notification-icon.png', color: '#F5B700', defaultChannel: 'workshop' }],
      '@config-plugins/react-native-pdf',
      '@config-plugins/react-native-blob-util',
      ['expo-secure-store', { faceIDPermission: false }],
    ],
    experiments: {
      typedRoutes: true,
    },
    android: {
      package: variant.androidPackage,
      adaptiveIcon: variant.iconConfig.adaptiveIcon,
      // FCM config for push; one file lists both variants' packages. EAS builds get it from the secret
      // `GOOGLE_SERVICES_JSON` file variable; local runs and OTA fingerprints read the gitignored copy here.
      googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
      // Google Play refuses an upload that declares photo or video read access without a policy declaration.
      // The system photo picker needs no grant, and saving our own camera photos to the album is write-only.
      blockedPermissions: [
        'android.permission.READ_MEDIA_IMAGES',
        'android.permission.READ_MEDIA_VIDEO',
        'android.permission.READ_MEDIA_VISUAL_USER_SELECTED',
      ],
    },
    ios: {
      bundleIdentifier: variant.iosBundleIdentifier,
      infoPlist: {
        ITSAppUsesNonExemptEncryption: false,
      },
    },
    extra: {
      eas: {
        projectId: 'f99a92bd-b14d-49ae-8c27-6d19c09dddcc',
      },
    },
    updates: {
      url: 'https://u.expo.dev/f99a92bd-b14d-49ae-8c27-6d19c09dddcc',
    },
    owner: 'deanvanniekerk',
  };
};
