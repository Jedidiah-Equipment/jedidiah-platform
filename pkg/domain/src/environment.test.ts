import { describe, expect, it } from 'vitest';

import { getReleaseMetadata, isRemoteAppEnv, resolveDocsOrigin } from './environment.js';

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

describe('resolveDocsOrigin', () => {
  it('offers no Help when no docs site is configured', () => {
    expect(resolveDocsOrigin(undefined, 'development')).toBeNull();
    expect(resolveDocsOrigin(null, 'production')).toBeNull();
    expect(resolveDocsOrigin('', 'development')).toBeNull();
  });

  it('takes a configured origin and strips its trailing slashes', () => {
    expect(resolveDocsOrigin('https://docs.example.com///', 'production')).toBe('https://docs.example.com');
  });

  it('keeps a loopback origin in development, where it is the local docs server', () => {
    expect(resolveDocsOrigin('http://localhost:7006', 'development')).toBe('http://localhost:7006');
  });

  it('drops a loopback origin once deployed, rather than pointing a tablet at itself', () => {
    expect(resolveDocsOrigin('http://localhost:7006', 'staging')).toBeNull();
    expect(resolveDocsOrigin('http://127.0.0.1:7006', 'production')).toBeNull();
    expect(resolveDocsOrigin('http://[::1]:7006', 'production')).toBeNull();
  });

  it('treats an unparseable origin as configured rather than swallowing it', () => {
    expect(resolveDocsOrigin('not a url', 'production')).toBe('not a url');
  });
});
