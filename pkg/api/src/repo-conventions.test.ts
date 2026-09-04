import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

const repoRoot = join(import.meta.dirname, '..', '..', '..');

type BiomeOverride = {
  includes?: string[];
  linter?: {
    rules?: {
      style?: {
        noRestrictedImports?: {
          level?: string;
          options?: { patterns?: { group?: string[] }[] };
        };
      };
    };
  };
};

function readBiomeOverrides(): BiomeOverride[] {
  const config = JSON.parse(readFileSync(join(repoRoot, 'biome.json'), 'utf8')) as { overrides?: BiomeOverride[] };

  return config.overrides ?? [];
}

// The alias rule guards TypeScript sources; an override that only reaches stylesheets has nothing to carry.
function targetsFrontendSource(override: BiomeOverride): boolean {
  return (override.includes ?? []).some((pattern) => /^pkg\/(web|mobile)\//.test(pattern) && !pattern.endsWith('.css'));
}

describe('.git-blame-ignore-revs', () => {
  it('lists only commits reachable from HEAD', () => {
    const entries = readFileSync(join(repoRoot, '.git-blame-ignore-revs'), 'utf8')
      .split('\n')
      .map((line) => line.trim())
      .filter((line) => line.length > 0 && !line.startsWith('#'));

    expect(entries.length).toBeGreaterThan(0);

    for (const sha of entries) {
      const result = spawnSync('git', ['merge-base', '--is-ancestor', sha, 'HEAD'], {
        cwd: repoRoot,
        encoding: 'utf8',
      });

      expect(
        result.status,
        `${sha} is not an ancestor of HEAD. Entries must be the squash commit that landed on main, never a pre-merge branch commit: git blame only honours reachable history.\n${result.stderr}`,
      ).toBe(0);
    }
  });
});

describe('biome.json overrides', () => {
  const overrides = readBiomeOverrides();

  it('keeps the deep-relative alias rule on every web and mobile source override', () => {
    const frontendOverrides = overrides.filter(targetsFrontendSource);

    expect(frontendOverrides.length).toBeGreaterThan(0);

    for (const override of frontendOverrides) {
      const patterns = override.linter?.rules?.style?.noRestrictedImports?.options?.patterns ?? [];

      expect(
        patterns.some((pattern) => pattern.group?.includes('../../**')),
        `override ${JSON.stringify(override.includes)} lost the ../../** pattern group; an override replaces noRestrictedImports wholesale, so the alias rule must be restated in each one`,
      ).toBe(true);
    }
  });

  it('sets noRestrictedImports to error wherever it is configured', () => {
    const configured = overrides.filter((override) => override.linter?.rules?.style?.noRestrictedImports);

    expect(configured.length).toBeGreaterThan(0);

    for (const override of configured) {
      expect(
        override.linter?.rules?.style?.noRestrictedImports?.level,
        `override ${JSON.stringify(override.includes)} must set noRestrictedImports level to "error"`,
      ).toBe('error');
    }
  });
});
