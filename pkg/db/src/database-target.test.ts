import { describe, expect, it } from 'vitest';
import {
  assertLocalDatabaseTarget,
  databaseTargetsMatch,
  resolveConfirmedRemoteDatabaseUrl,
} from './database-target.js';

const env = {
  APP_ENV: 'staging',
  DATABASE_URL: 'postgres://postgres:postgres@localhost:5432/jedidiah',
  STAGING_DATABASE_URL: 'postgres://staging.example.test/app',
  PRODUCTION_DATABASE_URL: 'postgres://production.example.test/app',
};

describe('databaseTargetsMatch', () => {
  it('ignores credentials, postgres protocol aliases, default ports, and connection options', () => {
    expect(
      databaseTargetsMatch(
        'postgres://first:secret@database.example.test/app',
        'postgresql://second:different@database.example.test:5432/app?sslmode=require',
      ),
    ).toBe(true);
  });
});

describe('assertLocalDatabaseTarget', () => {
  it('allows loopback databases and refuses remotes, configured or in disguise', () => {
    expect(() => assertLocalDatabaseTarget('postgres://[::1]/jedidiah', 'seeding', {})).not.toThrow();
    expect(() => assertLocalDatabaseTarget(env.PRODUCTION_DATABASE_URL, 'seeding', {})).toThrow(
      'Seeding refused because DATABASE_URL is not a loopback database.',
    );
    expect(() =>
      assertLocalDatabaseTarget(env.DATABASE_URL, 'seeding', {
        STAGING_DATABASE_URL: 'postgresql://a:b@LOCALHOST/jedidiah',
      }),
    ).toThrow('DATABASE_URL matches STAGING_DATABASE_URL');
  });
});

describe('resolveConfirmedRemoteDatabaseUrl', () => {
  const confirmation = { variable: 'CONFIRM_THING', value: 'yes' };
  const action = 'doing the thing';

  it('names the target twice and requires the other remote before returning the URL', () => {
    expect(() =>
      resolveConfirmedRemoteDatabaseUrl({ target: 'staging', confirmation, action, env: { ...env, APP_ENV: 'x' } }),
    ).toThrow('Doing the thing requires APP_ENV=staging.');
    expect(() => resolveConfirmedRemoteDatabaseUrl({ target: 'staging', confirmation, action, env })).toThrow(
      'requires CONFIRM_THING=yes',
    );
    const confirmed = { ...env, CONFIRM_THING: 'yes' };
    expect(() =>
      resolveConfirmedRemoteDatabaseUrl({
        target: 'staging',
        confirmation,
        action,
        env: { ...confirmed, PRODUCTION_DATABASE_URL: undefined },
      }),
    ).toThrow('PRODUCTION_DATABASE_URL is required for doing the thing.');
    expect(resolveConfirmedRemoteDatabaseUrl({ target: 'staging', confirmation, action, env: confirmed })).toBe(
      env.STAGING_DATABASE_URL,
    );
  });

  it('refuses a remote that resolves to the other remote', () => {
    expect(() =>
      resolveConfirmedRemoteDatabaseUrl({
        target: 'production',
        confirmation,
        action,
        env: {
          ...env,
          APP_ENV: 'production',
          CONFIRM_THING: 'yes',
          STAGING_DATABASE_URL: 'postgresql://x:y@PRODUCTION.example.test/app',
        },
      }),
    ).toThrow('the production and staging databases match');
  });
});
