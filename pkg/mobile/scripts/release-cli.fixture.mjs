// Offline CLI boundary for the concurrency regression test. Synchronize after both writers have
// written their bundle/styles, so a shared path deterministically publishes the other profile.
import assert from 'node:assert/strict';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { basename, join } from 'node:path';
import { setTimeout } from 'node:timers/promises';

const args = process.argv.slice(2);
const profile = process.env.APP_VARIANT;
const value = (flag) => args[args.indexOf(flag) + 1];
const apiBaseUrl = process.env.EXPO_PUBLIC_API_BASE_URL;
const cli = basename(process.argv[1]);
const expected = { apiBaseUrl, profile };
const readBundle = (directory) => JSON.parse(readFileSync(join(directory, 'metadata.json'), 'utf8'));

async function exportFiles(directory, kind) {
  mkdirSync(directory, { recursive: true });
  mkdirSync(process.env.NATIVEWIND_CACHE_DIR, { recursive: true });
  writeFileSync(join(directory, 'metadata.json'), JSON.stringify(expected));
  const styles = join(process.env.NATIVEWIND_CACHE_DIR, 'ios.js');
  writeFileSync(styles, profile);
  const barrier = process.env.RELEASE_TEST_BARRIER;
  writeFileSync(join(barrier, `${profile}-${kind}`), 'ready');
  const deadline = Date.now() + 5000;
  while (!['staging', 'production'].every((p) => existsSync(join(barrier, `${p}-${kind}`)))) {
    assert(Date.now() < deadline, 'Concurrent release did not reach the export barrier');
    await setTimeout(10);
  }
  assert.equal(readFileSync(styles, 'utf8'), profile, 'Generated styles were overwritten by another release');
}

if (cli === 'pnpm') {
  if (args.includes('expo')) {
    await exportFiles(value('--output-dir'), 'ota');
  } else {
    assert.deepEqual(readBundle(value('--directory')), expected, 'Source maps came from another profile');
  }
} else if (args[0] === 'build:list') {
  console.log(
    JSON.stringify([
      {
        id: 'fixture-build',
        status: 'FINISHED',
        platform: value('--platform').toUpperCase(),
        buildProfile: profile,
        channel: profile,
        distribution: 'STORE',
        runtimeVersion: 'fixture-runtime',
      },
    ]),
  );
} else if (args[0] === 'fingerprint:generate') {
  console.log(JSON.stringify({ hash: 'fixture-runtime' }));
} else if (args[0] === 'update') {
  assert.deepEqual(readBundle(value('--input-dir')), expected, 'Published bundle targets the other API');
  assert.equal(value('--channel'), profile);
} else if (args[0] === 'build') {
  assert.equal(value('--profile'), profile);
  assert(args.includes('--local'));
  assert(!process.env.EAS_LOCAL_BUILD_ARTIFACT_PATH, 'Inherited artifact path bypasses isolation');
  mkdirSync(process.env.EAS_LOCAL_BUILD_WORKINGDIR, { recursive: true });
  writeFileSync(join(process.env.EAS_LOCAL_BUILD_WORKINGDIR, 'profile'), profile);
  await exportFiles(process.env.EAS_LOCAL_BUILD_ARTIFACTS_DIR, 'native');
  assert.equal(readFileSync(join(process.env.EAS_LOCAL_BUILD_WORKINGDIR, 'profile'), 'utf8'), profile);
  rmSync(process.env.EAS_LOCAL_BUILD_WORKINGDIR, { recursive: true });
} else {
  throw new Error(`Unexpected offline CLI invocation: ${args[0]}`);
}
