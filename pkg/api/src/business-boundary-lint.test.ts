import { spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import type { StorageAdapter } from '@pkg/core/shared';
import { hasPermission } from '@pkg/domain/shared';
import { describe, expect, expectTypeOf, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const biome = join(repoRoot, 'node_modules', '.bin', 'biome');

function lintAt(path: string, source: string) {
  const fixtureRoot = mkdtempSync(join(tmpdir(), 'business-boundary-lint-'));
  const fixturePath = join(fixtureRoot, path, 'probe.ts');
  const configPath = join(fixtureRoot, 'biome.json');

  try {
    mkdirSync(dirname(fixturePath), { recursive: true });
    writeFileSync(configPath, readFileSync(join(repoRoot, 'biome.json')));
    writeFileSync(fixturePath, `${source}\n`);

    return spawnSync(
      biome,
      ['lint', '--config-path', configPath, '--only=lint/style/noRestrictedImports', fixturePath],
      {
        cwd: repoRoot,
        encoding: 'utf8',
      },
    );
  } finally {
    // An interrupted process can only strand an inert OS-temp fixture, never a source file.
    rmSync(fixtureRoot, { recursive: true });
  }
}

describe('business namespace import boundary', () => {
  it.each([
    ['equipment', 'contracting'],
    ['contracting', 'equipment'],
  ] as const)('rejects a %s module importing the %s business', (owner, importedBusiness) => {
    const result = lintAt(`pkg/core/src/${owner}`, `import '../${importedBusiness}/feature.js';`);

    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('Business namespaces may import shared code, never each other.');
  });

  it.each([
    ['web Equipment pages', 'pkg/web/src/equipment/pages/jobs'],
    ['mobile Equipment components', 'pkg/mobile/src/equipment/components/jobs'],
  ])('rejects Contracting imports from %s', (_surface, path) => {
    const result = lintAt(path, `import '@/contracting/feature.js';`);

    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(result.stdout + result.stderr).toContain('Business namespaces may import shared code, never each other.');
  });

  it.each([
    ['web shared components', 'pkg/web/src/components/probe'],
    ['mobile shared libraries', 'pkg/mobile/src/lib/probe'],
  ])('rejects business imports from %s', (_surface, path) => {
    const result = lintAt(path, `import '@/equipment/feature.js';`);

    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(result.stdout + result.stderr).toContain(
      'Shared frontend modules cannot import a business namespace; keep business composition in explicit route wiring.',
    );
  });

  it.each([
    ['Equipment modules', 'pkg/web/src/equipment/pages/jobs'],
    ['Contracting modules', 'pkg/web/src/contracting/pages/jobs'],
    ['shared frontend modules', 'pkg/web/src/components/probe'],
  ])('keeps the deep-relative import restriction active for %s', (_surface, path) => {
    const result = lintAt(path, `import '../../../feature.js';`);

    expect(result.status, result.stdout + result.stderr).not.toBe(0);
    expect(result.stdout + result.stderr).toContain(
      'Use the @/* alias instead of imports that traverse more than one parent directory.',
    );
  });

  it.each(['equipment', 'contracting'] as const)('allows %s modules to import shared infrastructure', (owner) => {
    const result = lintAt(`pkg/domain/src/${owner}`, `import '../../formatting/date.js';`);

    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it.each(['@pkg/core/shared', '@pkg/domain/shared'])('allows contracting modules to import %s', (packageName) => {
    const result = lintAt('pkg/api/src/routes/contracting', `import '${packageName}';`);

    expect(result.status, result.stdout + result.stderr).toBe(0);
  });

  it.each(['@pkg/core', '@pkg/domain'])(
    'rejects the equipment-heavy %s barrel from contracting code',
    (packageName) => {
      const result = lintAt('pkg/api/src/routes/contracting', `import '${packageName}';`);

      expect(result.status, result.stdout + result.stderr).not.toBe(0);
      expect(result.stdout + result.stderr).toContain('Business namespaces may import shared code, never each other.');
    },
  );

  it('exposes shared package entrypoints independently of the Equipment-heavy root barrels', () => {
    expect(hasPermission).toBeTypeOf('function');
    expectTypeOf<StorageAdapter['get']>().toBeFunction();
  });
});
