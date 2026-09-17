import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const EAS_CONFIG_PATH = new URL('../eas.json', import.meta.url);

/**
 * The `eas update` invocation for a build profile. `eas update` bundles on this machine and ignores
 * eas.json's build `env`, yet every `EXPO_PUBLIC_*` value is inlined at bundle time — so the profile's
 * env is applied here, over the caller's, or the update ships local defaults to store builds. Metro's
 * transform cache can retain those inlined values across profiles, so every update also clears it.
 */
export function resolveUpdateCommand({ args, commitSubject, easConfig, profile }) {
  const build = easConfig.build?.[profile];
  if (!build?.channel) {
    const profiles = Object.keys(easConfig.build ?? {}).join(', ');
    throw new Error(`Expected a build profile with a channel (${profiles}); received ${profile ?? 'nothing'}.`);
  }

  const hasMessage = args.some((arg) => arg === '--message' || arg === '-m' || arg.startsWith('--message='));
  const hasClearCache = args.includes('--clear-cache');

  return {
    args: [
      'update',
      '--channel',
      build.channel,
      ...(hasClearCache ? [] : ['--clear-cache']),
      ...(hasMessage ? [] : ['--message', commitSubject]),
      ...args,
    ],
    env: build.env ?? {},
  };
}

export function resolveSourceMapUploadCommand(env) {
  const missing = ['POSTHOG_CLI_API_KEY', 'POSTHOG_CLI_PROJECT_ID'].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`PostHog source-map upload requires ${missing.join(' and ')} in the release shell.`);
  }
  return {
    executable: 'pnpm',
    args: ['exec', 'posthog-cli', 'hermes', 'upload', '--directory', 'dist', '--release-mode', 'symbol-set'],
  };
}

function main() {
  const [profile, ...args] = process.argv.slice(2);
  const easConfig = JSON.parse(readFileSync(EAS_CONFIG_PATH, 'utf8'));
  const commitSubject = execFileSync('git', ['log', '-1', '--format=%s'], { encoding: 'utf8' }).trim();
  const command = resolveUpdateCommand({ args, commitSubject, easConfig, profile });
  // Fail before publishing when symbolication cannot complete; this script cannot roll an OTA back.
  const sourceMaps = resolveSourceMapUploadCommand(process.env);

  const result = spawnSync('eas', command.args, {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, ...command.env },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    process.exitCode = result.status ?? 1;
    return;
  }

  const upload = spawnSync(sourceMaps.executable, sourceMaps.args, {
    cwd: new URL('..', import.meta.url),
    env: process.env,
    stdio: 'inherit',
  });
  if (upload.error) throw upload.error;
  process.exitCode = upload.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
