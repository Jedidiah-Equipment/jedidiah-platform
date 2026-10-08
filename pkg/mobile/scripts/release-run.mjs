import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { basename, join } from 'node:path';
import { fileURLToPath } from 'node:url';

export const MOBILE_DIR = fileURLToPath(new URL('..', import.meta.url));

/** One export/upload/publish owns these paths, even when the same profile runs twice. */
export function createReleaseRun(kind, profile, mobileDir = MOBILE_DIR) {
  if (!['ota', 'native'].includes(kind) || !['staging', 'production'].includes(profile)) {
    throw new Error('Release paths require ota/native and staging/production.');
  }
  const parent = join(mobileDir, 'dist', kind, profile);
  mkdirSync(parent, { recursive: true });
  const directory = mkdtempSync(join(parent, 'run-'));
  const outputDir = join(directory, kind === 'ota' ? 'bundle' : 'artifacts');
  const tempDir = join(directory, 'tmp');
  // Resolve inside the bundling project's node_modules. EAS local builds unpack the project into
  // a different directory; an absolute path here would load styles/dependencies from this checkout.
  const stylesDir = join('node_modules', '.cache', 'nativewind-release', kind, profile, basename(directory));
  mkdirSync(tempDir);
  mkdirSync(outputDir);

  return {
    directory,
    outputDir,
    env: {
      // Expo's Metro transform and file-map caches follow os.tmpdir(). Override all platforms.
      TMPDIR: tempDir,
      TMP: tempDir,
      TEMP: tempDir,
      // NativeWind otherwise writes every export's generated styles into one dependency cache.
      NATIVEWIND_CACHE_DIR: stylesDir,
      ...(kind === 'native'
        ? {
            EAS_LOCAL_BUILD_WORKINGDIR: join(directory, 'work'),
            EAS_LOCAL_BUILD_ARTIFACTS_DIR: outputDir,
          }
        : {}),
    },
    cleanup: () => {
      rmSync(tempDir, { recursive: true, force: true });
      rmSync(join(mobileDir, stylesDir), { recursive: true, force: true });
    },
  };
}
