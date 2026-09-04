import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const biome = join(repoRoot, 'node_modules', '.bin', 'biome');

const BUSINESS_WALL = 'Business namespaces may import shared code, never each other.';
const SHARED_BACKEND_WALL =
  'Shared modules cannot import a business namespace; keep business composition in explicit app wiring.';
const SHARED_FRONTEND_WALL =
  'Shared frontend modules cannot import a business namespace; keep business composition in explicit route wiring.';
const DEEP_RELATIVE = 'Use the @/* alias instead of imports that traverse more than one parent directory.';

// Lints `source` as if it lived at `filePath` (repo-relative) under a copy of the real biome.json.
function lintAt(filePath: string, source: string) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'business-boundary-lint-'));
  const fixturePath = join(fixtureRoot, filePath);
  const configPath = join(fixtureRoot, 'biome.json');

  try {
    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(configPath, readFileSync(join(repoRoot, 'biome.json')));
    writeFileSync(fixturePath, `${source}\n`);

    const result = spawnSync(
      biome,
      ['lint', '--config-path', configPath, '--only=lint/style/noRestrictedImports', fixturePath],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    );

    return { output: result.stdout + result.stderr, status: result.status };
  } finally {
    // An interrupted process can only strand an inert OS-temp fixture, never a source file.
    rmSync(fixtureRoot, { recursive: true });
  }
}

function expectRejected(result: ReturnType<typeof lintAt>, message: string) {
  expect(result.status, result.output).not.toBe(0);
  expect(result.output).toContain(message);
}

function expectAllowed(result: ReturnType<typeof lintAt>) {
  expect(result.status, result.output).toBe(0);
}

const BUSINESS_ENTRYPOINT_PACKAGES = ['core', 'db', 'domain', 'schema'] as const;

describe('business namespace import boundary', () => {
  it.each([
    ['equipment', 'contracting'],
    ['contracting', 'equipment'],
  ] as const)('rejects a %s module importing the %s business', (owner, importedBusiness) => {
    expectRejected(
      lintAt(`pkg/core/src/${owner}/probe.ts`, `import '../${importedBusiness}/feature.js';`),
      BUSINESS_WALL,
    );
  });

  it.each(['@pkg/core', '@pkg/domain'])('allows contracting modules to import the shared %s root', (packageName) => {
    expectAllowed(lintAt('pkg/api/src/routes/contracting/probe.ts', `import '${packageName}';`));
  });

  it.each(BUSINESS_ENTRYPOINT_PACKAGES)('rejects @pkg/%s/equipment from contracting modules', (packageName) => {
    expectRejected(
      lintAt('pkg/api/src/routes/contracting/probe.ts', `import '@pkg/${packageName}/equipment';`),
      BUSINESS_WALL,
    );
  });

  it.each(BUSINESS_ENTRYPOINT_PACKAGES)('rejects @pkg/%s/contracting from equipment modules', (packageName) => {
    expectRejected(
      lintAt('pkg/api/src/routes/equipment/probe.ts', `import '@pkg/${packageName}/contracting';`),
      BUSINESS_WALL,
    );
  });

  it.each([
    ['a relative equipment path', `import '../equipment/feature.js';`],
    ['the @pkg/domain/equipment entrypoint', `import '@pkg/domain/equipment';`],
  ])('rejects %s from a shared backend module', (_label, source) => {
    expectRejected(lintAt('pkg/core/src/files/probe.ts', source), SHARED_BACKEND_WALL);
  });

  it('allows the tRPC router wiring file to compose equipment routes', () => {
    expectAllowed(lintAt('pkg/api/src/trpc/router.ts', `import '../routes/equipment/x.js';`));
  });

  it.each([
    ['web Equipment pages', 'pkg/web/src/equipment/pages/jobs/probe.ts'],
    ['mobile Equipment components', 'pkg/mobile/src/equipment/components/jobs/probe.ts'],
  ])('rejects Contracting imports from %s', (_surface, filePath) => {
    expectRejected(lintAt(filePath, `import '@/contracting/feature.js';`), BUSINESS_WALL);
  });

  it.each([
    ['web shared components', 'pkg/web/src/components/probe/probe.ts'],
    ['mobile shared libraries', 'pkg/mobile/src/lib/probe/probe.ts'],
  ])('rejects business imports from %s', (_surface, filePath) => {
    expectRejected(lintAt(filePath, `import '@/equipment/feature.js';`), SHARED_FRONTEND_WALL);
  });

  // A multi-segment path: `../../feature.js` alone matched a hollow rule that let the alias
  // restriction disappear from an override without any test noticing.
  it.each([
    ['Equipment modules', 'pkg/web/src/equipment/pages/jobs/probe.ts'],
    ['Contracting modules', 'pkg/web/src/contracting/pages/jobs/probe.ts'],
    ['shared frontend modules', 'pkg/web/src/components/probe/probe.ts'],
    ['mobile Equipment modules', 'pkg/mobile/src/equipment/components/jobs/probe.ts'],
  ])('keeps the deep-relative import restriction active for %s', (_surface, filePath) => {
    expectRejected(lintAt(filePath, `import '../../inventory/feature.js';`), DEEP_RELATIVE);
  });

  it.each(['equipment', 'contracting'] as const)('allows %s modules to import shared infrastructure', (owner) => {
    expectAllowed(lintAt(`pkg/domain/src/${owner}/probe.ts`, `import '../../formatting/date.js';`));
  });
});
