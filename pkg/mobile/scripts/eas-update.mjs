import { execFileSync, spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

const EAS_CONFIG_PATH = new URL('../eas.json', import.meta.url);

/**
 * The `eas update` invocation for a build profile. `eas update` bundles on this machine and ignores
 * eas.json's build `env`, yet every `EXPO_PUBLIC_*` value is inlined at bundle time — so the profile's
 * env is applied here, over the caller's, or the update ships local defaults to store builds.
 */
export function resolveUpdateCommand({ args, commitSubject, easConfig, profile }) {
  const build = easConfig.build?.[profile];
  if (!build?.channel) {
    const profiles = Object.keys(easConfig.build ?? {}).join(', ');
    throw new Error(`Expected a build profile with a channel (${profiles}); received ${profile ?? 'nothing'}.`);
  }

  const hasMessage = args.some((arg) => arg === '--message' || arg === '-m' || arg.startsWith('--message='));

  return {
    args: ['update', '--channel', build.channel, ...(hasMessage ? [] : ['--message', commitSubject]), ...args],
    env: build.env ?? {},
  };
}

function main() {
  const [profile, ...args] = process.argv.slice(2);
  const easConfig = JSON.parse(readFileSync(EAS_CONFIG_PATH, 'utf8'));
  const commitSubject = execFileSync('git', ['log', '-1', '--format=%s'], { encoding: 'utf8' }).trim();
  const command = resolveUpdateCommand({ args, commitSubject, easConfig, profile });

  const result = spawnSync('eas', command.args, {
    cwd: new URL('..', import.meta.url),
    env: { ...process.env, ...command.env },
    stdio: 'inherit',
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  try {
    main();
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
  }
}
