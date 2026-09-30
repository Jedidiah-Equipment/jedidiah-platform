import assert from 'node:assert/strict';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

function fixture(t, overrides = {}) {
  const root = mkdtempSync(join(tmpdir(), 'jedidiah-slot-'));
  t.after(() => rmSync(root, { recursive: true, force: true }));
  mkdirSync(join(root, 'scripts'));
  mkdirSync(join(root, 'bin'));
  cpSync(new URL('./use-slot.sh', import.meta.url), join(root, 'scripts/use-slot.sh'));
  writeFileSync(join(root, 'docker-compose.yml'), 'services: {}\n');
  const env = { ...process.env, PATH: `${root}/bin:${process.env.PATH}`, SLOT_TEST_ROOT: root, ...overrides };
  for (const tool of ['docker', 'pnpm', 'lsof']) {
    writeFileSync(
      join(root, 'bin', tool),
      `#!${process.execPath}
const fs = require('node:fs');
const root = process.env.SLOT_TEST_ROOT;
const args = process.argv.slice(2);
fs.appendFileSync(root + '/calls', JSON.stringify({ tool: '${tool}', args,
  project: process.env.COMPOSE_PROJECT_NAME, database: process.env.DATABASE_URL,
  template: process.env.TEST_DATABASE_URL, storage: process.env.DOCUMENT_STORAGE_ENDPOINT,
  postgresPort: process.env.POSTGRES_HOST_PORT, minioPort: process.env.MINIO_API_HOST_PORT,
  consolePort: process.env.MINIO_CONSOLE_HOST_PORT, nodeEnv: process.env.NODE_ENV }) + '\\n');
const step = args[0];
if (process.env.SLOT_TEST_FAIL === '${tool}:' + step) {
  console.error('deliberate failure'); process.exit(7);
}
if ('${tool}' === 'docker' && args[0] === 'ps') console.log('/previous checkout');
if ('${tool}' === 'lsof') {
  const listener = root + '/listener';
  if (args.includes('tcp:7202') && fs.existsSync(listener)) console.log(fs.readFileSync(listener, 'utf8'));
  else process.exit(1);
}
`,
      { mode: 0o755 },
    );
  }
  const write = (path, content) => {
    mkdirSync(join(root, path, '..'), { recursive: true });
    writeFileSync(join(root, path), content);
  };
  return {
    root,
    write,
    read: (path) => readFileSync(join(root, path), 'utf8'),
    calls: () => (existsSync(join(root, 'calls')) ? readFileSync(join(root, 'calls'), 'utf8').trim().split('\n').map(JSON.parse) : []),
    run: (...args) => spawnSync('sh', [join(root, 'scripts/use-slot.sh'), ...args], { env, encoding: 'utf8' }),
  };
}

test('requires one explicit slot from 1–9 before touching services or env files', (t) => {
  const f = fixture(t);
  for (const args of [[], ['0'], ['10'], ['02'], ['-1'], ['oops'], ['2', '3'], ['--']]) {
    const result = f.run(...args);
    assert.equal(result.status, 2, result.stderr);
    assert.equal(f.calls().length, 0);
    assert.equal(existsSync(join(f.root, '.env.dev')), false);
  }
  assert.equal(f.run('--help').status, 0);
});

test('an unavailable Docker daemon leaves handwritten env and services alone', (t) => {
  const f = fixture(t, { SLOT_TEST_FAIL: 'docker:info' });
  f.write('.env.dev', 'KEEP=custom\n');
  const result = f.run('2');
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Docker is not running/);
  assert.equal(f.read('.env.dev'), 'KEEP=custom\n');
  assert.deepEqual(f.calls().map((call) => call.tool), ['docker']);
});

test('takes over the named stack, preserves handwritten lines, and migrates both databases before seeding', (t) => {
  const f = fixture(t, { COMPOSE_PROJECT_NAME: 'another_stack', DATABASE_URL: 'postgres://elsewhere/other' });
  f.write('.env.dev', 'KEEP=root\n# >>> parallel-env (slot 8)\nCOMPOSE_PROJECT_NAME=jedidiah_slot8\n# <<< parallel-env\nAFTER=root\n');
  f.write('pkg/api/.env.dev', 'OPENAI_API_KEY=private-test-key\nPORT=1234\n# >>> worktree-setup\nPORT=7802\n# <<< worktree-setup\nAFTER=api\n');
  f.write('pkg/mobile/.env.local', 'EXPO_PUBLIC_CUSTOM=value\n');
  const result = f.run('--', '2');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /previous holder: \/previous checkout/);
  assert.match(result.stdout, /jedidiah_slot8; that stack is left running/);
  assert.match(result.stdout, /Slot 2 is ready/);
  assert.match(result.stdout, /http:\/\/localhost:7201/);
  assert.match(result.stdout, /postgres:\/\/postgres:postgres@localhost:7205\/jedidiah/);
  assert.match(f.read('.env.dev'), /^KEEP=root\nAFTER=root\n/);
  assert.match(f.read('.env.dev'), /COMPOSE_PROJECT_NAME=jedidiah_slot2/);
  assert.doesNotMatch(f.read('.env.dev'), /parallel-env/);
  assert.match(f.read('pkg/api/.env.dev'), /^OPENAI_API_KEY=private-test-key\nPORT=1234\nAFTER=api\n/);
  assert.match(f.read('pkg/api/.env.dev'), /PORT=7202/);
  assert.doesNotMatch(f.read('pkg/api/.env.dev'), /worktree-setup/);
  assert.match(f.read('pkg/api/.env.dev'), /AUTH_TRUSTED_ORIGINS=http:\/\/localhost:7201,http:\/\/localhost:7202,http:\/\/localhost:7203,jedidiahops:\/\//);
  assert.match(f.read('pkg/web/.env.dev'), /AUTH_BASE_URL=http:\/\/localhost:7202\/api\/auth/);
  assert.match(f.read('pkg/lander/.env.dev'), /PORT=7204/);
  assert.match(f.read('pkg/db/.env.dev'), /TEST_DATABASE_URL=.*:7205\/jedidiah_template/);
  for (const pkg of ['ai', 'api', 'core', 'db', 'lander']) {
    assert.match(f.read(`pkg/${pkg}/.env.test`), /TEST_DATABASE_URL=.*:7205\/jedidiah_template/);
  }
  assert.match(f.read('pkg/mobile/.env.local'), /^EXPO_PUBLIC_CUSTOM=value\n/);
  assert.match(f.read('pkg/mobile/.env.local'), /RCT_METRO_PORT=7203\nEXPO_PUBLIC_API_PORT=7202\nEXPO_PUBLIC_LANDER_ORIGIN=http:\/\/localhost:7204/);
  const calls = f.calls();
  const down = calls.find((call) => call.tool === 'docker' && call.args[0] === 'compose');
  assert.deepEqual(down.args, ['compose', '-p', 'jedidiah_slot2', '-f', join(f.root, 'docker-compose.yml'), 'down', '-v', '--remove-orphans']);
  const bootstrap = calls.filter((call) => call.tool === 'pnpm');
  assert.deepEqual(bootstrap.map((call) => call.args), [['compose:up'], ['db:migrate'], ['db:migrate:test'], ['db:seed']]);
  for (const call of bootstrap) {
    assert.equal(call.project, 'jedidiah_slot2');
    assert.equal(call.database, 'postgres://postgres:postgres@localhost:7205/jedidiah');
    assert.equal(call.template, 'postgres://postgres:postgres@localhost:7205/jedidiah_template');
    assert.equal(call.storage, 'http://localhost:7206');
    assert.equal(call.postgresPort, '7205');
    assert.equal(call.minioPort, '7206');
    assert.equal(call.consolePort, '7207');
    assert.equal(call.nodeEnv, 'development');
  }
  assert.equal(calls.findIndex((call) => call === down) < calls.findIndex((call) => call.tool === 'pnpm'), true);
  assert.deepEqual(calls.filter((call) => call.tool === 'lsof').map((call) => call.args[2]), ['tcp:7201', 'tcp:7202', 'tcp:7203', 'tcp:7204']);
});

test('rerunning rebuilds the slot; switching replaces managed values without accumulating blocks', (t) => {
  const f = fixture(t);
  assert.equal(f.run('2').status, 0);
  const original = f.read('pkg/api/.env.dev');
  assert.equal(f.run('2').status, 0);
  assert.equal(f.read('pkg/api/.env.dev'), original);
  assert.equal(f.run('9').status, 0);
  assert.match(f.read('pkg/api/.env.dev'), /PORT=7902/);
  assert.doesNotMatch(f.read('pkg/api/.env.dev'), /7202/);
  assert.equal(f.read('pkg/api/.env.dev').match(/# >>> use-slot/g).length, 1);
  const downs = f.calls().filter((call) => call.tool === 'docker' && call.args[0] === 'compose');
  assert.deepEqual(downs.map((call) => call.args[2]), ['jedidiah_slot2', 'jedidiah_slot2', 'jedidiah_slot9']);
});

test('bootstrap failures stop before later commands and never report readiness', (t) => {
  for (const [index, step] of ['docker:compose', 'pnpm:compose:up', 'pnpm:db:migrate', 'pnpm:db:migrate:test', 'pnpm:db:seed'].entries()) {
    const f = fixture(t, { SLOT_TEST_FAIL: step });
    f.write('.env.dev', 'KEEP=custom\n');
    const result = f.run('2');
    assert.equal(result.status, 7, result.stderr);
    assert.match(result.stderr, /Failed \(exit 7\)/);
    assert.doesNotMatch(result.stdout, /is ready/);
    assert.equal(f.calls().filter((call) => call.tool === 'pnpm').length, index);
    if (index === 0) assert.equal(f.read('.env.dev'), 'KEEP=custom\n');
  }
});

test('stops a previous holder’s listener before rebuilding Docker', async (t) => {
  const f = fixture(t);
  const child = spawn(process.execPath, ['-e', `
    const fs = require('node:fs');
    fs.writeFileSync(${JSON.stringify(join(f.root, 'listener'))}, String(process.pid));
    process.on('SIGTERM', () => {
      fs.unlinkSync(${JSON.stringify(join(f.root, 'listener'))});
      process.exit(0);
    });
    console.log('ready');
    setInterval(() => {}, 1000);
  `]);
  t.after(() => child.kill());
  await once(child.stdout, 'data');
  const exited = once(child, 'exit');
  const result = f.run('2');
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /Stopping dev servers on 7202/);
  assert.equal(existsSync(join(f.root, 'listener')), false);
  await exited;
});
