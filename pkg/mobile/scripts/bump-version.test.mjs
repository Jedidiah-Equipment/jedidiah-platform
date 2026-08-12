import { describe, expect, it } from 'vitest';

import { bumpVersion, updateAppConfigVersion } from './bump-version.mjs';

describe('bumpVersion', () => {
  it.each([
    ['patch', '1.2.4'],
    ['minor', '1.3.0'],
    ['major', '2.0.0'],
  ])('applies a %s bump', (bump, expected) => {
    expect(bumpVersion('1.2.3', bump)).toBe(expected);
  });

  it('rejects unsupported bump types', () => {
    expect(() => bumpVersion('1.2.3', 'build')).toThrow('patch, minor, or major');
  });
});

describe('updateAppConfigVersion', () => {
  it('updates the app config version without changing surrounding content', () => {
    const source = "return {\n  version: '1.0.1',\n  orientation: 'portrait',\n};\n";

    expect(updateAppConfigVersion(source, 'patch')).toEqual({
      currentVersion: '1.0.1',
      nextVersion: '1.0.2',
      updatedSource: "return {\n  version: '1.0.2',\n  orientation: 'portrait',\n};\n",
    });
  });

  it('refuses ambiguous app config input', () => {
    const source = "version: '1.0.0',\nversion: '2.0.0',\n";

    expect(() => updateAppConfigVersion(source, 'patch')).toThrow('found 2');
  });
});
