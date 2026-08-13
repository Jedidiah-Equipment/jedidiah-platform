import { describe, expect, it } from 'vitest';

import { resolveUpdatePrompt, shouldCheckForUpdate, type UpdateSnapshot, updateCheckIntervalMs } from './app-update';

const NEXT_UPDATE = { createdAt: new Date('2026-08-13T06:00:00.000Z'), updateId: 'update-2' };

function snapshot(overrides: Partial<UpdateSnapshot> = {}): UpdateSnapshot {
  return {
    availableUpdate: undefined,
    downloadedUpdate: undefined,
    isEnabled: true,
    isUpdateAvailable: false,
    isUpdatePending: false,
    ...overrides,
  };
}

describe('resolveUpdatePrompt', () => {
  it('stays hidden where updates are disabled, so a dev client is never prompted', () => {
    const prompt = resolveUpdatePrompt({
      dismissedUpdateKey: null,
      installState: 'idle',
      snapshot: snapshot({ availableUpdate: NEXT_UPDATE, isEnabled: false, isUpdateAvailable: true }),
    });

    expect(prompt.kind).toBe('hidden');
  });

  it('stays hidden while the running build is the newest one', () => {
    const prompt = resolveUpdatePrompt({ dismissedUpdateKey: null, installState: 'idle', snapshot: snapshot() });

    expect(prompt.kind).toBe('hidden');
  });

  it('offers an update that has been found but not downloaded yet', () => {
    const prompt = resolveUpdatePrompt({
      dismissedUpdateKey: null,
      installState: 'idle',
      snapshot: snapshot({ availableUpdate: NEXT_UPDATE, isUpdateAvailable: true }),
    });

    expect(prompt).toEqual({ kind: 'offered', updateKey: 'update-2' });
  });

  it('offers an update that expo already downloaded in the background', () => {
    const prompt = resolveUpdatePrompt({
      dismissedUpdateKey: null,
      installState: 'idle',
      snapshot: snapshot({ downloadedUpdate: NEXT_UPDATE, isUpdatePending: true }),
    });

    expect(prompt).toEqual({ kind: 'offered', updateKey: 'update-2' });
  });

  it('keys a rollback directive off its creation time, since it carries no update id', () => {
    const prompt = resolveUpdatePrompt({
      dismissedUpdateKey: null,
      installState: 'idle',
      snapshot: snapshot({
        availableUpdate: { createdAt: new Date('2026-08-13T06:00:00.000Z'), updateId: undefined },
        isUpdateAvailable: true,
      }),
    });

    expect(prompt).toEqual({ kind: 'offered', updateKey: 'rollback:2026-08-13T06:00:00.000Z' });
  });

  it('hides an update the user asked to be left alone about', () => {
    const prompt = resolveUpdatePrompt({
      dismissedUpdateKey: 'update-2',
      installState: 'idle',
      snapshot: snapshot({ availableUpdate: NEXT_UPDATE, isUpdateAvailable: true }),
    });

    expect(prompt.kind).toBe('hidden');
  });

  it('asks again once a newer update than the dismissed one arrives', () => {
    const prompt = resolveUpdatePrompt({
      dismissedUpdateKey: 'update-2',
      installState: 'idle',
      snapshot: snapshot({
        availableUpdate: { createdAt: new Date('2026-08-13T07:00:00.000Z'), updateId: 'update-3' },
        isUpdateAvailable: true,
      }),
    });

    expect(prompt).toEqual({ kind: 'offered', updateKey: 'update-3' });
  });

  it('owes the user the outcome of an install they asked for, dismissed or not', () => {
    const running = resolveUpdatePrompt({
      dismissedUpdateKey: 'update-2',
      installState: 'installing',
      snapshot: snapshot({ availableUpdate: NEXT_UPDATE, isUpdateAvailable: true }),
    });
    const failed = resolveUpdatePrompt({
      dismissedUpdateKey: 'update-2',
      installState: 'failed',
      snapshot: snapshot({ availableUpdate: NEXT_UPDATE, isUpdateAvailable: true }),
    });

    expect(running).toEqual({ kind: 'installing', updateKey: 'update-2' });
    expect(failed).toEqual({ kind: 'failed', updateKey: 'update-2' });
  });
});

describe('shouldCheckForUpdate', () => {
  const now = new Date('2026-08-13T08:00:00.000Z').getTime();

  it('checks the first time the app comes to the foreground', () => {
    expect(
      shouldCheckForUpdate({ isChecking: false, isDownloading: false, isEnabled: true, lastCheckedAt: undefined, now }),
    ).toBe(true);
  });

  it('never checks where updates are disabled', () => {
    expect(
      shouldCheckForUpdate({
        isChecking: false,
        isDownloading: false,
        isEnabled: false,
        lastCheckedAt: undefined,
        now,
      }),
    ).toBe(false);
  });

  it('does not stack a check on top of one already in flight', () => {
    expect(
      shouldCheckForUpdate({ isChecking: true, isDownloading: false, isEnabled: true, lastCheckedAt: undefined, now }),
    ).toBe(false);
    expect(
      shouldCheckForUpdate({ isChecking: false, isDownloading: true, isEnabled: true, lastCheckedAt: undefined, now }),
    ).toBe(false);
  });

  it('holds off until the check interval has passed, then checks again', () => {
    const justChecked = new Date(now - updateCheckIntervalMs + 1000);
    const staleCheck = new Date(now - updateCheckIntervalMs);

    expect(
      shouldCheckForUpdate({
        isChecking: false,
        isDownloading: false,
        isEnabled: true,
        lastCheckedAt: justChecked,
        now,
      }),
    ).toBe(false);
    expect(
      shouldCheckForUpdate({
        isChecking: false,
        isDownloading: false,
        isEnabled: true,
        lastCheckedAt: staleCheck,
        now,
      }),
    ).toBe(true);
  });
});
