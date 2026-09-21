import { describe, expect, it } from 'vitest';

import {
  assertCompatibleBuilds,
  resolveExportCommand,
  resolveReleaseEnvironment,
  resolveSourceMapUploadCommand,
  resolveUpdateCommand,
} from './eas-update.mjs';

const easConfig = {
  build: {
    staging: {
      channel: 'staging',
      distribution: 'store',
      env: { APP_VARIANT: 'staging', EXPO_PUBLIC_API_BASE_URL: 'https://staging-api.example' },
    },
  },
};

describe('resolveUpdateCommand', () => {
  it("publishes to the profile's channel with the profile's build env", () => {
    expect(resolveUpdateCommand({ args: [], commitSubject: 'fix: thing', easConfig, profile: 'staging' })).toEqual({
      args: [
        'update',
        '--channel',
        'staging',
        '--skip-bundler',
        '--input-dir',
        'dist',
        '--environment',
        'production',
        '--message',
        'fix: thing',
      ],
      env: { APP_VARIANT: 'staging', EXPO_PUBLIC_API_BASE_URL: 'https://staging-api.example' },
    });
  });

  it.each([[['--message', 'hotfix']], [['-m', 'hotfix']], [['--message=hotfix']]])(
    'keeps a caller message instead of the commit subject (%j)',
    (args) => {
      const { args: commandArgs } = resolveUpdateCommand({
        args,
        commitSubject: 'fix: thing',
        easConfig,
        profile: 'staging',
      });

      expect(commandArgs).toEqual([
        'update',
        '--channel',
        'staging',
        '--skip-bundler',
        '--input-dir',
        'dist',
        '--environment',
        'production',
        ...args,
      ]);
    },
  );

  it('uses a caller-provided cache reset during the owned export rather than publish', () => {
    const { args } = resolveUpdateCommand({
      args: ['--clear-cache'],
      commitSubject: 'fix: thing',
      easConfig,
      profile: 'staging',
    });

    expect(args).toEqual([
      'update',
      '--channel',
      'staging',
      '--skip-bundler',
      '--input-dir',
      'dist',
      '--environment',
      'production',
      '--message',
      'fix: thing',
    ]);
  });

  it('rejects a profile eas.json does not define', () => {
    expect(() => resolveUpdateCommand({ args: [], commitSubject: '', easConfig, profile: 'preview' })).toThrow(
      'received preview',
    );
  });

  it('rejects caller overrides of the pre-publish bundle', () => {
    expect(() =>
      resolveUpdateCommand({ args: ['--input-dir', 'other'], commitSubject: '', easConfig, profile: 'staging' }),
    ).toThrow('owns --skip-bundler and --input-dir');
  });

  it('rejects an EAS environment that differs from the build profile', () => {
    expect(() =>
      resolveUpdateCommand({
        args: ['--environment', 'production'],
        commitSubject: '',
        easConfig: { build: { staging: { ...easConfig.build.staging, environment: 'preview' } } },
        profile: 'staging',
      }),
    ).toThrow('must match the staging build environment (preview)');
  });
});

describe('assertCompatibleBuilds', () => {
  const build = { channel: 'staging', distribution: 'store' };

  function matchingEas(_executable, args) {
    if (args[0] === 'build:list') {
      const platform = args[args.indexOf('--platform') + 1];
      return JSON.stringify([
        {
          id: `${platform}-build`,
          status: 'FINISHED',
          platform: platform.toUpperCase(),
          buildProfile: 'staging',
          updateChannel: { name: 'staging' },
          distribution: 'STORE',
          runtime: { version: `${platform}-hash` },
        },
      ]);
    }
    const platform = args[args.indexOf('--platform') + 1];
    return JSON.stringify({ hash: `${platform}-hash` });
  }

  it('allows an OTA when both fingerprints match the latest finished EAS builds', () => {
    const calls = [];
    const runEas = (_executable, args) => {
      calls.push(args);
      return matchingEas(_executable, args);
    };

    expect(() => assertCompatibleBuilds({ profile: 'staging', build, env: {}, runEas })).not.toThrow();
    expect(calls).toHaveLength(4);
    expect(calls[0]).toEqual([
      'build:list',
      '--platform',
      'android',
      '--build-profile',
      'staging',
      '--channel',
      'staging',
      '--distribution',
      'store',
      '--status',
      'finished',
      '--limit',
      '1',
      '--json',
    ]);
    expect(calls[1]).toContain('fingerprint:generate');
    expect(calls[2]).toContain('ios');
  });

  it('also accepts the older flat EAS build fields', () => {
    const runEas = (executable, args) => {
      const result = JSON.parse(matchingEas(executable, args));
      if (args[0] !== 'build:list') return JSON.stringify(result);
      return JSON.stringify(
        result.map(({ updateChannel, runtime, ...buildResult }) => ({
          ...buildResult,
          channel: updateChannel.name,
          runtimeVersion: runtime.version,
        })),
      );
    };

    expect(() => assertCompatibleBuilds({ profile: 'staging', build, env: {}, runEas })).not.toThrow();
  });

  it('blocks an OTA when a platform fingerprint changed', () => {
    const runEas = (_executable, args) =>
      args[0] === 'fingerprint:generate' && args.includes('android')
        ? JSON.stringify({ hash: 'android-new' })
        : matchingEas(_executable, args);

    expect(() => assertCompatibleBuilds({ profile: 'staging', build, env: {}, runEas })).toThrow(
      'Full build and publish required before staging OTA: android fingerprint differs',
    );
  });

  it('rejects a build from the wrong channel even if EAS returns it', () => {
    const runEas = (_executable, args) => {
      const result = JSON.parse(matchingEas(_executable, args));
      if (args[0] === 'build:list') result[0].updateChannel.name = 'production';
      return JSON.stringify(result);
    };

    expect(() => assertCompatibleBuilds({ profile: 'staging', build, env: {}, runEas })).toThrow('unexpected metadata');
  });

  it('fails closed when there is no finished store build', () => {
    expect(() =>
      assertCompatibleBuilds({ profile: 'staging', build, env: {}, runEas: () => JSON.stringify([]) }),
    ).toThrow('No finished staging android store build found in EAS');
  });

  it('fails closed when EAS cannot list builds', () => {
    expect(() =>
      assertCompatibleBuilds({
        profile: 'staging',
        build,
        env: {},
        runEas: () => {
          throw new Error('EAS unavailable');
        },
      }),
    ).toThrow('OTA compatibility; update not published');
  });
});

describe('resolveExportCommand', () => {
  it('exports both native Hermes bundles with source maps before publish', () => {
    expect(resolveExportCommand()).toEqual({
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
    });
  });
});

describe('resolveSourceMapUploadCommand', () => {
  it('uploads Hermes source maps when both PostHog credentials are present', () => {
    expect(resolveSourceMapUploadCommand({ POSTHOG_CLI_API_KEY: 'phx_test', POSTHOG_CLI_PROJECT_ID: '123' })).toEqual({
      args: ['exec', 'posthog-cli', 'hermes', 'upload', '--directory', 'dist', '--release-mode', 'symbol-set'],
      executable: 'pnpm',
    });
  });

  it('refuses to publish an OTA when source-map credentials are absent', () => {
    expect(() => resolveSourceMapUploadCommand({})).toThrow(
      'PostHog source-map upload requires POSTHOG_CLI_API_KEY and POSTHOG_CLI_PROJECT_ID',
    );
  });
});

describe('resolveReleaseEnvironment', () => {
  it.each([
    ['staging', 'staging-key', '123'],
    ['production', 'production-key', '456'],
  ])('loads %s PostHog credentials from the shared .env.dev file', (profile, apiKey, projectId) => {
    const readFile = (path) => {
      expect(path.pathname.endsWith('/pkg/mobile/.env.dev')).toBe(true);
      return [
        'STAGING_POSTHOG_CLI_API_KEY=staging-key',
        'STAGING_POSTHOG_CLI_PROJECT_ID=123',
        'STAGING_POSTHOG_CLI_HOST=https://us.posthog.com',
        'PRODUCTION_POSTHOG_CLI_API_KEY=production-key',
        'PRODUCTION_POSTHOG_CLI_PROJECT_ID=456',
        'PRODUCTION_POSTHOG_CLI_HOST=https://eu.posthog.com',
      ].join('\n');
    };

    const env = resolveReleaseEnvironment(profile, { POSTHOG_CLI_API_KEY: 'shell-key' }, readFile);

    expect(env).toMatchObject({
      POSTHOG_CLI_API_KEY: apiKey,
      POSTHOG_CLI_PROJECT_ID: projectId,
      POSTHOG_CLI_HOST: profile === 'staging' ? 'https://us.posthog.com' : 'https://eu.posthog.com',
    });
    expect(env).not.toHaveProperty('STAGING_POSTHOG_CLI_API_KEY');
    expect(env).not.toHaveProperty('PRODUCTION_POSTHOG_CLI_API_KEY');
    expect(() => resolveSourceMapUploadCommand(env)).not.toThrow();
  });

  it('keeps shell values when file entries are empty', () => {
    const env = resolveReleaseEnvironment(
      'staging',
      { POSTHOG_CLI_API_KEY: 'shell-key', POSTHOG_CLI_PROJECT_ID: '123' },
      () => 'STAGING_POSTHOG_CLI_API_KEY=\nSTAGING_POSTHOG_CLI_PROJECT_ID=\n',
    );

    expect(env.POSTHOG_CLI_API_KEY).toBe('shell-key');
    expect(env.POSTHOG_CLI_PROJECT_ID).toBe('123');
  });

  it('rejects a partial profile instead of mixing file and shell credentials', () => {
    expect(() =>
      resolveReleaseEnvironment(
        'staging',
        { POSTHOG_CLI_PROJECT_ID: 'shell-project', POSTHOG_CLI_HOST: 'https://eu.posthog.com' },
        () => 'STAGING_POSTHOG_CLI_API_KEY=staging-key\n',
      ),
    ).toThrow('Incomplete staging PostHog credentials in .env.dev');
  });
});
