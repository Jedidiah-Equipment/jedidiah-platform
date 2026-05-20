import { describe, expect, it } from 'vitest';

import { getReleaseMetadata, isRemoteAppEnv } from './environment.js';

describe('environment helpers', () => {
  it.each([
    ['development', false],
    ['staging', true],
    ['production', true],
  ] as const)('maps %s remote environment status', (appEnv, expected) => {
    expect(isRemoteAppEnv(appEnv)).toBe(expected);
  });

  it('prefers git commit sha over deployment id for release metadata', () => {
    expect(
      getReleaseMetadata({
        railwayDeploymentId: 'deployment_1',
        railwayGitCommitSha: 'abc123',
      }),
    ).toBe('abc123');
  });

  it('falls back to deployment id for release metadata', () => {
    expect(
      getReleaseMetadata({
        railwayDeploymentId: 'deployment_1',
        railwayGitCommitSha: null,
      }),
    ).toBe('deployment_1');
  });

  it('returns null when no release metadata is present', () => {
    expect(getReleaseMetadata({})).toBeNull();
  });
});
