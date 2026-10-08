import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { createReleaseRun, MOBILE_DIR } from './release-run.mjs';

export function resolveBuildCommand(profile, args, easConfig) {
  const build = easConfig.build?.[profile];
  if (!build) throw new Error(`Unknown EAS build profile: ${profile}.`);
  if (args.some((arg) => arg === '--profile' || arg === '-e' || arg.startsWith('--profile=') || arg.startsWith('-e'))) {
    throw new Error('The build script owns --profile; use mobile:build:staging or mobile:build:production.');
  }
  if (args.some((arg) => arg === '--output' || arg.startsWith('--output='))) {
    throw new Error('The build script owns local artifact paths; output is printed before the build.');
  }
  return { args: ['build', '--profile', profile, ...args], env: build.env ?? {} };
}

function main() {
  const [profile, ...args] = process.argv.slice(2);
  const easConfig = JSON.parse(readFileSync(new URL('../eas.json', import.meta.url), 'utf8'));
  const command = resolveBuildCommand(profile, args, easConfig);
  const run = createReleaseRun('native', profile);
  console.log(`Native artifacts (local builds): ${run.outputDir}`);
  const env = { ...process.env, ...command.env, ...run.env };
  // EAS's single-artifact override would take precedence over the isolated artifact directory.
  delete env.EAS_LOCAL_BUILD_ARTIFACT_PATH;
  try {
    const result = spawnSync('eas', command.args, {
      cwd: MOBILE_DIR,
      env,
      stdio: 'inherit',
    });
    if (result.error) throw result.error;
    process.exitCode = result.status ?? 1;
  } finally {
    run.cleanup();
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
