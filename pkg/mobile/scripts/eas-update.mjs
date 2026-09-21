import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';
import { parseEnv } from 'node:util';

const EAS_CONFIG_PATH = new URL('../eas.json', import.meta.url);
const MOBILE_DIR = new URL('..', import.meta.url);

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
  const environments = args.flatMap((arg, index) => {
    if (arg === '--environment') return [args[index + 1]];
    if (arg.startsWith('--environment=')) return [arg.slice('--environment='.length)];
    return [];
  });
  const buildEnvironment = resolveBuildEnvironment(build);
  if (environments.some((environment) => environment !== buildEnvironment)) {
    throw new Error(`OTA --environment must match the ${profile} build environment (${buildEnvironment}).`);
  }
  if (args.some((arg) => arg === '--skip-bundler' || arg === '--input-dir' || arg.startsWith('--input-dir='))) {
    throw new Error('The OTA wrapper owns --skip-bundler and --input-dir so it can upload source maps before publish.');
  }
  const publishArgs = args.filter((arg) => arg !== '--clear-cache');

  return {
    args: [
      'update',
      '--channel',
      build.channel,
      '--skip-bundler',
      '--input-dir',
      'dist',
      ...(environments.length > 0 ? [] : ['--environment', buildEnvironment]),
      ...(hasMessage ? [] : ['--message', commitSubject]),
      ...publishArgs,
    ],
    env: build.env ?? {},
  };
}

function readEasJson(args, env, runEas) {
  let output;
  try {
    output = runEas('eas', args, {
      cwd: MOBILE_DIR,
      env,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'inherit'],
      maxBuffer: 4 * 1024 * 1024,
    });
  } catch {
    throw new Error(`Could not complete EAS ${args[0]} to verify OTA compatibility; update not published.`);
  }
  try {
    return JSON.parse(output);
  } catch {
    throw new Error(`EAS ${args[0]} returned invalid JSON; OTA compatibility could not be verified.`);
  }
}

export function assertCompatibleBuilds({ profile, build, env, runEas = execFileSync }) {
  const incompatible = [];
  for (const platform of ['android', 'ios']) {
    const builds = readEasJson(
      [
        'build:list',
        '--platform',
        platform,
        '--build-profile',
        profile,
        '--channel',
        build.channel,
        '--distribution',
        build.distribution ?? 'store',
        '--status',
        'finished',
        '--limit',
        '1',
        '--json',
      ],
      env,
      runEas,
    );
    const latestBuild = Array.isArray(builds) ? builds[0] : undefined;
    if (!latestBuild) {
      throw new Error(`No finished ${profile} ${platform} store build found in EAS; OTA not published.`);
    }
    const channel = latestBuild.updateChannel?.name ?? latestBuild.channel;
    const runtimeVersion = latestBuild.runtime?.version ?? latestBuild.runtimeVersion;
    if (
      typeof latestBuild.id !== 'string' ||
      !latestBuild.id ||
      latestBuild.status !== 'FINISHED' ||
      latestBuild.platform !== platform.toUpperCase() ||
      latestBuild.buildProfile !== profile ||
      channel !== build.channel ||
      latestBuild.distribution?.toLowerCase() !== (build.distribution ?? 'store') ||
      typeof runtimeVersion !== 'string' ||
      !runtimeVersion
    ) {
      throw new Error(
        `Latest ${profile} ${platform} EAS build has unexpected metadata; OTA compatibility could not be verified.`,
      );
    }

    const fingerprint = readEasJson(
      ['fingerprint:generate', '--build-profile', profile, '--platform', platform, '--json', '--non-interactive'],
      env,
      runEas,
    );
    if (typeof fingerprint?.hash !== 'string' || !fingerprint.hash) {
      throw new Error(
        `Could not read the current ${profile} ${platform} fingerprint; OTA compatibility could not be verified.`,
      );
    }
    if (fingerprint.hash !== runtimeVersion) {
      incompatible.push(`${platform} fingerprint differs from latest finished build ${latestBuild.id}`);
    }
  }

  if (incompatible.length > 0) {
    throw new Error(
      `Full build and publish required before ${profile} OTA: ${incompatible.join('; ')}. Build and submit the affected platform(s), then retry.`,
    );
  }
}

function releasePrefix(profile) {
  const prefixes = { staging: 'STAGING', production: 'PRODUCTION' };
  const prefix = prefixes[profile];
  if (!prefix) throw new Error(`No local release env is configured for ${profile ?? 'nothing'}.`);
  return prefix;
}

function readLocalReleaseEnv(readFile) {
  try {
    return parseEnv(readFile(new URL('../.env.dev', import.meta.url), 'utf8'));
  } catch (error) {
    if (error?.code === 'ENOENT') return {};
    throw error;
  }
}

function resolveBuildEnvironment(build) {
  if (build.environment) return build.environment;
  if (build.distribution === 'store') return 'production';
  if (build.developmentClient) return 'development';
  return 'preview';
}

export function resolveExportCommand() {
  return {
    executable: 'pnpm',
    args: [
      'exec',
      'expo',
      'export',
      '--output-dir',
      'dist',
      '--source-maps',
      '--dump-assetmap',
      '--platform',
      'ios',
      '--platform',
      'android',
      '--clear',
    ],
  };
}

export function resolveSourceMapUploadCommand(env) {
  const missing = ['POSTHOG_CLI_API_KEY', 'POSTHOG_CLI_PROJECT_ID'].filter((name) => !env[name]);
  if (missing.length > 0) {
    throw new Error(`PostHog source-map upload requires ${missing.join(' and ')} in the release environment.`);
  }
  return {
    executable: 'pnpm',
    args: ['exec', 'posthog-cli', 'hermes', 'upload', '--directory', 'dist', '--release-mode', 'symbol-set'],
  };
}

export function resolveReleaseEnvironment(profile, env = process.env, readFile = readFileSync) {
  const prefix = releasePrefix(profile);
  const fileEnv = readLocalReleaseEnv(readFile);

  const names = ['POSTHOG_CLI_API_KEY', 'POSTHOG_CLI_PROJECT_ID', 'POSTHOG_CLI_HOST'];
  const selected = Object.fromEntries(names.map((name) => [name, fileEnv[`${prefix}_${name}`]]));
  if (names.every((name) => !selected[name])) return env;

  const missing = names.filter((name) => !selected[name]);
  if (missing.length > 0) {
    throw new Error(
      `Incomplete ${profile} PostHog credentials in .env.dev: set ${missing.join(', ')} or leave all three empty to use the release shell.`,
    );
  }
  return { ...env, ...selected };
}

function main() {
  const [profile, ...args] = process.argv.slice(2);
  const easConfig = JSON.parse(readFileSync(EAS_CONFIG_PATH, 'utf8'));
  const commitSubject = execFileSync('git', ['log', '-1', '--format=%s'], { encoding: 'utf8' }).trim();
  const command = resolveUpdateCommand({ args, commitSubject, easConfig, profile });
  const releaseEnv = resolveReleaseEnvironment(profile);
  const updateEnv = { ...releaseEnv, ...command.env };
  assertCompatibleBuilds({ profile, build: easConfig.build[profile], env: updateEnv });
  const bundle = resolveExportCommand();
  // Bundle and upload before publishing because this script cannot roll an OTA back.
  const sourceMaps = resolveSourceMapUploadCommand(releaseEnv);

  const bundleResult = spawnSync(bundle.executable, bundle.args, {
    cwd: MOBILE_DIR,
    env: updateEnv,
    stdio: 'inherit',
  });
  if (bundleResult.error) throw bundleResult.error;
  if (bundleResult.status !== 0) {
    process.exitCode = bundleResult.status ?? 1;
    return;
  }

  const upload = spawnSync(sourceMaps.executable, sourceMaps.args, {
    cwd: MOBILE_DIR,
    env: releaseEnv,
    stdio: 'inherit',
  });
  if (upload.error) throw upload.error;
  if (upload.status !== 0) {
    process.exitCode = upload.status ?? 1;
    return;
  }

  const publish = spawnSync('eas', command.args, {
    cwd: MOBILE_DIR,
    env: updateEnv,
    stdio: 'inherit',
  });
  if (publish.error) throw publish.error;
  process.exitCode = publish.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
