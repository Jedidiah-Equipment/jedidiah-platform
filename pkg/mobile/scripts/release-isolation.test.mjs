import { execFile } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { promisify } from 'node:util';
import { describe, expect, it } from 'vitest';
import { resolveBuildCommand } from './eas-build.mjs';
import { createReleaseRun, MOBILE_DIR } from './release-run.mjs';

const exec = promisify(execFile);

describe('release isolation', () => {
  it.each(['ota', 'native'])(
    'keeps concurrent %s releases on their own API, styles, and artifact paths',
    async (kind) => {
      const directory = mkdtempSync(join(tmpdir(), 'release-isolation-test-'));
      const bin = join(directory, 'bin');
      mkdirSync(bin);
      const fixture = new URL('./release-cli.fixture.mjs', import.meta.url).href;
      for (const cli of ['eas', 'pnpm']) {
        writeFileSync(join(bin, cli), `#!${process.execPath}\nimport ${JSON.stringify(fixture)};\n`, { mode: 0o755 });
      }
      const outputs = [];
      try {
        await Promise.all(
          ['staging', 'production'].map(async (profile) => {
            const script = kind === 'ota' ? 'eas-update.mjs' : 'eas-build.mjs';
            const { stdout } = await exec(
              process.execPath,
              [
                join(MOBILE_DIR, 'scripts', script),
                profile,
                '--platform',
                'ios',
                ...(kind === 'native' ? ['--local'] : []),
              ],
              {
                cwd: MOBILE_DIR,
                env: {
                  ...process.env,
                  PATH: `${bin}:${process.env.PATH}`,
                  APP_VARIANT: profile,
                  EAS_LOCAL_BUILD_ARTIFACT_PATH: join(directory, 'shared.ipa'),
                  RELEASE_TEST_BARRIER: directory,
                  POSTHOG_CLI_API_KEY: 'fixture-key',
                  POSTHOG_CLI_PROJECT_ID: 'fixture-project',
                },
                timeout: 10000,
              },
            );
            const output = stdout.split('\n')[0].split(': ').slice(1).join(': ');
            outputs.push(output);
            expect(output).toContain(`/dist/${kind}/${profile}/run-`);
            const metadata = JSON.parse(readFileSync(join(output, 'metadata.json'), 'utf8'));
            expect(metadata).toEqual({
              profile,
              apiBaseUrl: `https://${profile === 'staging' ? 'staging-api' : 'api'}.jedidiahequipment.co.za`,
            });
          }),
        );
        expect(new Set(outputs).size).toBe(2);
      } finally {
        for (const output of outputs) rmSync(dirname(output), { recursive: true, force: true });
        rmSync(directory, { recursive: true, force: true });
      }
    },
  );

  it('separates two runs of the same profile and retains artifacts when clearing temporary caches', () => {
    const directory = mkdtempSync(join(tmpdir(), 'release-runs-test-'));
    try {
      const first = createReleaseRun('ota', 'staging', directory);
      const second = createReleaseRun('ota', 'staging', directory);
      expect(first.outputDir).not.toBe(second.outputDir);
      expect(first.env.TMPDIR).not.toBe(second.env.TMPDIR);
      writeFileSync(join(first.outputDir, 'bundle'), 'staging');
      first.cleanup();
      expect(readFileSync(join(first.outputDir, 'bundle'), 'utf8')).toBe('staging');
      mkdirSync(join(second.env.TMPDIR, 'cache'));
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("keeps NativeWind styles inside an EAS local build's unpacked project", async () => {
    const directory = mkdtempSync(join(tmpdir(), 'nativewind-project-test-'));
    const run = createReleaseRun('native', 'staging', directory);
    const project = join(realpathSync(directory), 'unpacked-project');
    mkdirSync(project);
    writeFileSync(join(project, 'package.json'), JSON.stringify({ name: 'fixture', version: '1.0.0' }));
    writeFileSync(join(project, 'app.json'), JSON.stringify({ expo: { userInterfaceStyle: 'automatic' } }));
    try {
      const { stdout } = await exec(
        process.execPath,
        [
          '--input-type=commonjs',
          '-e',
          `
          const { withCssInterop } = require(${JSON.stringify(join(MOBILE_DIR, 'node_modules/react-native-css-interop/metro'))});
          const input = require('node:path').join(process.cwd(), 'global.css');
          const config = withCssInterop({ resolver: { sourceExts: [] } }, { input, getCSSForPlatform() {} });
          const resolved = config.resolver.resolveRequest({ resolveRequest: () => ({ filePath: input }) }, 'styles', 'ios');
          console.log(JSON.stringify({ cache: config.transformer.cssInterop_outputDirectory, file: resolved.filePath }));
        `,
        ],
        { cwd: project, env: { ...process.env, ...run.env } },
      );
      const result = JSON.parse(stdout);
      expect(result.cache).toBe(run.env.NATIVEWIND_CACHE_DIR);
      expect(result.file).toBe(join(project, run.env.NATIVEWIND_CACHE_DIR, 'ios.js'));
      expect(readFileSync(result.file, 'utf8')).toBe('');
    } finally {
      run.cleanup();
      rmSync(directory, { recursive: true, force: true });
    }
  });
});

describe('native build routing', () => {
  const easConfig = { build: { staging: { env: { APP_VARIANT: 'staging' } } } };
  it.each([['--profile', 'production'], ['-eproduction'], ['--output', 'shared.ipa']])(
    'rejects overrides that bypass the selected profile or isolated artifacts (%j)',
    (...args) => {
      expect(() => resolveBuildCommand('staging', args, easConfig)).toThrow('script owns');
    },
  );
});
