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
          options?: { paths?: Record<string, unknown>; patterns?: { group?: string[] }[] };
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

// Files that may call date-fns formatting directly: the domain formatters themselves, the schema's
// DateOnlyIso coercion, and vendored calendar chrome.
const DATE_FNS_FORMATTING_ALLOWLIST = [
  'pkg/domain/src/',
  'pkg/schema/src/common/date.ts',
  'pkg/web/src/components/kibo-ui/',
  'pkg/web/src/components/ui/calendar.tsx',
];

function isDateFnsFormattingAllowlisted(override: BiomeOverride): boolean {
  const positiveIncludes = (override.includes ?? []).filter((pattern) => !pattern.startsWith('!'));

  return (
    positiveIncludes.length > 0 &&
    positiveIncludes.every((pattern) => DATE_FNS_FORMATTING_ALLOWLIST.some((prefix) => pattern.startsWith(prefix)))
  );
}

// Display formatting belongs to `pkg/domain/src/formatting`; these are the only other places a raw
// locale or fixed-decimal formatter may run, each for a reason that is not display of a value.
const RAW_FORMATTER_ALLOWLIST = [
  'pkg/domain/src/formatting/',
  // Upload size limits in error copy: `1.5 MB`, not a reading.
  'pkg/domain/src/files/file-policy.ts',
  // Vendored react-day-picker chrome and its data attributes.
  'pkg/web/src/components/ui/calendar.tsx',
  // Sub-cent ledger precision checks, not rendering.
  'pkg/web/src/equipment/utils/part-quantity-format.ts',
];

describe('display formatting', () => {
  it('formats dates, amounts, and counts only through the @pkg/domain formatters', () => {
    const result = spawnSync(
      'git',
      [
        'grep',
        '--untracked',
        '-nE',
        String.raw`toLocaleDateString\(|toLocaleTimeString\(|toLocaleString\(|Intl\.DateTimeFormat\(|Intl\.NumberFormat\(|\.toFixed\(`,
        '--',
        'pkg/*/src/**',
        'pkg/mobile/app/**',
      ],
      { cwd: repoRoot, encoding: 'utf8' },
    );
    const offenders = result.stdout
      .split('\n')
      .filter((line) => line.length > 0 && !RAW_FORMATTER_ALLOWLIST.some((prefix) => line.startsWith(prefix)));

    expect(
      offenders,
      'Render through formatDate (named format), formatCurrency, formatNumber, formatPercent, or formatHours from @pkg/domain',
    ).toEqual([]);
  });
});

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

  it('restates the date-fns formatting restriction on every override outside its allowlist', () => {
    const configured = overrides.filter((override) => override.linter?.rules?.style?.noRestrictedImports);

    for (const override of configured) {
      const options = override.linter?.rules?.style?.noRestrictedImports?.options;
      const restricted =
        options?.paths?.['date-fns'] !== undefined &&
        (options.patterns ?? []).some((pattern) => pattern.group?.includes('date-fns/format'));

      expect(
        restricted,
        `override ${JSON.stringify(override.includes)} ${restricted ? 'restricts' : 'does not restrict'} date-fns formatting; an override replaces noRestrictedImports wholesale, so every override outside the allowlist must restate the date-fns path and its subpath patterns`,
      ).toBe(!isDateFnsFormattingAllowlisted(override));
    }
  });
});
