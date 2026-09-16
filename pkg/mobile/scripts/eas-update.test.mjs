import { describe, expect, it } from 'vitest';

import { resolveUpdateCommand } from './eas-update.mjs';

const easConfig = {
  build: {
    staging: {
      channel: 'staging',
      env: { APP_VARIANT: 'staging', EXPO_PUBLIC_API_BASE_URL: 'https://staging-api.example' },
    },
  },
};

describe('resolveUpdateCommand', () => {
  it("publishes to the profile's channel with the profile's build env", () => {
    expect(resolveUpdateCommand({ args: [], commitSubject: 'fix: thing', easConfig, profile: 'staging' })).toEqual({
      args: ['update', '--channel', 'staging', '--clear-cache', '--message', 'fix: thing'],
      env: { APP_VARIANT: 'staging', EXPO_PUBLIC_API_BASE_URL: 'https://staging-api.example' },
    });
  });

  it.each([[['--message', 'hotfix']], [['-m', 'hotfix']], [['--message=hotfix']]])(
    'keeps a caller message instead of the commit subject (%j)',
    (args) => {
      const { args: commandArgs } = resolveUpdateCommand({
        args,
        commitSubject: 'fix: thing',
        easConfig,
        profile: 'staging',
      });

      expect(commandArgs).toEqual(['update', '--channel', 'staging', '--clear-cache', ...args]);
    },
  );

  it('keeps a caller-provided cache reset without duplicating it', () => {
    const { args } = resolveUpdateCommand({
      args: ['--clear-cache'],
      commitSubject: 'fix: thing',
      easConfig,
      profile: 'staging',
    });

    expect(args).toEqual(['update', '--channel', 'staging', '--message', 'fix: thing', '--clear-cache']);
  });

  it('rejects a profile eas.json does not define', () => {
    expect(() => resolveUpdateCommand({ args: [], commitSubject: '', easConfig, profile: 'preview' })).toThrow(
      'received preview',
    );
  });
});
