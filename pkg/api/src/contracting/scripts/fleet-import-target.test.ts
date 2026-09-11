import { describe, expect, it } from 'vitest';
import { resolveFleetImportConfig } from './fleet-import-target.js';

const base = {
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/jedidiah',
  STAGING_DATABASE_URL: 'postgres://u:p@staging.example.com:5432/app',
  PRODUCTION_DATABASE_URL: 'postgres://u:p@production.example.com:5432/app',
  FLEET_IMPORT_DIR: '/tmp/fleet',
  FLEET_IMPORT_ACTOR_EMAIL: 'dean@example.com',
};

describe('resolveFleetImportConfig', () => {
  it('names the target twice before resolving its URL', () => {
    expect(() => resolveFleetImportConfig({ ...base })).toThrow('FLEET_IMPORT_TARGET must be one of');
    expect(() => resolveFleetImportConfig({ ...base, FLEET_IMPORT_TARGET: 'staging' })).toThrow(
      'CONFIRM_FLEET_IMPORT=staging',
    );
    expect(() =>
      resolveFleetImportConfig({ ...base, FLEET_IMPORT_TARGET: 'staging', CONFIRM_FLEET_IMPORT: 'staging' }),
    ).toThrow('APP_ENV=staging');
    expect(
      resolveFleetImportConfig({
        ...base,
        APP_ENV: 'staging',
        FLEET_IMPORT_TARGET: 'staging',
        CONFIRM_FLEET_IMPORT: 'staging',
      }),
    ).toEqual({
      target: 'staging',
      databaseUrl: base.STAGING_DATABASE_URL,
      directory: '/tmp/fleet',
      actorEmail: 'dean@example.com',
    });
  });

  it('refuses a remote target that cannot be proven distinct from the other remote', () => {
    const env = {
      ...base,
      APP_ENV: 'production',
      FLEET_IMPORT_TARGET: 'production',
      CONFIRM_FLEET_IMPORT: 'production',
    };
    expect(() => resolveFleetImportConfig({ ...env, STAGING_DATABASE_URL: undefined })).toThrow(
      'STAGING_DATABASE_URL is required',
    );
    expect(() =>
      resolveFleetImportConfig({ ...env, STAGING_DATABASE_URL: 'postgresql://x:y@PRODUCTION.example.com/app' }),
    ).toThrow('production and staging databases match');
  });

  it('keeps a local import on a loopback database that is not a remote in disguise', () => {
    const env = { ...base, FLEET_IMPORT_TARGET: 'local', CONFIRM_FLEET_IMPORT: 'local' };
    expect(resolveFleetImportConfig(env).databaseUrl).toBe(base.DATABASE_URL);
    expect(() => resolveFleetImportConfig({ ...env, DATABASE_URL: base.STAGING_DATABASE_URL })).toThrow(
      'not a loopback database',
    );
    expect(() =>
      resolveFleetImportConfig({ ...env, STAGING_DATABASE_URL: 'postgresql://a:b@LOCALHOST/jedidiah' }),
    ).toThrow('matches STAGING_DATABASE_URL');
  });
});
