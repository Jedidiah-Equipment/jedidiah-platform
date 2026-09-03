import { spawnSync } from 'node:child_process';
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..', '..');
const biome = join(repoRoot, 'node_modules', '.bin', 'biome');

function lintAt(path: string, source: string) {
  const fixtureDir = mkdtempSync(join(repoRoot, path, '.boundary-test-'));
  const fixturePath = join(fixtureDir, 'probe.ts');

  try {
    writeFileSync(fixturePath, `${source}\n`);
    return spawnSync(biome, ['lint', '--only=lint/style/noRestrictedImports', fixturePath], {
      cwd: repoRoot,
      encoding: 'utf8',
    });
  } finally {
    rmSync(fixtureDir, { recursive: true });
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

  it.each(['equipment', 'contracting'] as const)('allows %s modules to import shared infrastructure', (owner) => {
    const result = lintAt(`pkg/domain/src/${owner}`, `import '../../formatting/date.js';`);

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
});
