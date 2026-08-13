import { describe, expect, it } from 'vitest';

import { resolveUpdatePrompt, shouldCheckForUpdate, type UpdateSnapshot, updateCheckIntervalMs } from './app-update';

const NEXT_UPDATE = { createdAt: new Date('2026-08-13T06:00:00.000Z'), updateId: 'update-2' };
const LATER_UPDATE = { createdAt: new Date('2026-08-13T07:00:00.000Z'), updateId: 'update-3' };

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

type ResolveInput = Parameters<typeof resolveUpdatePrompt>[0];

function resolve(overrides: Partial<ResolveInput> & Pick<ResolveInput, 'snapshot'>) {
  return resolveUpdatePrompt({ dismissedUpdateKey: null, installState: 'idle', installUpdateKey: null, ...overrides });
}

describe('resolveUpdatePrompt', () => {
  it('stays hidden where updates are disabled, so a dev client is never prompted', () => {
    const prompt = resolve({
      snapshot: snapshot({ availableUpdate: NEXT_UPDATE, isEnabled: false, isUpdateAvailable: true }),
    });

    expect(prompt.kind).toBe('hidden');
  });

  it('stays hidden while the running build is the newest one', () => {
    expect(resolve({ snapshot: snapshot() }).kind).toBe('hidden');
  });

  it('offers an update that has been found but not downloaded yet', () => {
    const prompt = resolve({ snapshot: snapshot({ availableUpdate: NEXT_UPDATE, isUpdateAvailable: true }) });

    expect(prompt).toEqual({ kind: 'offered', updateKey: 'update-2' });
  });

  it('offers an update that expo already downloaded in the background', () => {
    const prompt = resolve({ snapshot: snapshot({ downloadedUpdate: NEXT_UPDATE, isUpdatePending: true }) });

    expect(prompt).toEqual({ kind: 'offered', updateKey: 'update-2' });
  });

  it('keys an update with no id off its creation time', () => {
    const prompt = resolve({
      snapshot: snapshot({
        availableUpdate: { createdAt: new Date('2026-08-13T06:00:00.000Z'), updateId: undefined },
        isUpdateAvailable: true,
      }),
    });

    expect(prompt).toEqual({ kind: 'offered', updateKey: 'at:2026-08-13T06:00:00.000Z' });
  });

  it('hides an update the user asked to be left alone about', () => {
    const prompt = resolve({
      dismissedUpdateKey: 'update-2',
      snapshot: snapshot({ availableUpdate: NEXT_UPDATE, isUpdateAvailable: true }),
    });

    expect(prompt.kind).toBe('hidden');
  });

  it('asks again once a newer update than the dismissed one arrives', () => {
    const prompt = resolve({
      dismissedUpdateKey: 'update-2',
      snapshot: snapshot({ availableUpdate: LATER_UPDATE, isUpdateAvailable: true }),
    });

    expect(prompt).toEqual({ kind: 'offered', updateKey: 'update-3' });
  });

  // Expo refreshes `availableUpdate` on a check but leaves `downloadedUpdate` on the last one it
  // actually fetched. Preferring the download would strand every update published in a long session.
  it('offers a newer available update over an older one already downloaded', () => {
    const prompt = resolve({
      dismissedUpdateKey: 'update-2',
      snapshot: snapshot({
        availableUpdate: LATER_UPDATE,
        downloadedUpdate: NEXT_UPDATE,
        isUpdateAvailable: true,
        isUpdatePending: true,
      }),
    });

    expect(prompt).toEqual({ kind: 'offered', updateKey: 'update-3' });
  });

  it('owes the user the outcome of an install they asked for, dismissed or not', () => {
    const started = { dismissedUpdateKey: 'update-2', installUpdateKey: 'update-2' } as const;
    const running = resolve({
      ...started,
      installState: 'installing',
      snapshot: snapshot({ availableUpdate: NEXT_UPDATE, isUpdateAvailable: true }),
    });
    const failed = resolve({
      ...started,
      installState: 'failed',
      snapshot: snapshot({ availableUpdate: NEXT_UPDATE, isUpdateAvailable: true }),
    });

    expect(running).toEqual({ kind: 'installing', updateKey: 'update-2' });
    expect(failed).toEqual({ kind: 'failed', updateKey: 'update-2' });
  });

  // Otherwise a standing "Update didn't install" gets re-pointed at an update nobody tried to install.
  it('does not carry an install outcome over to a different update', () => {
    const prompt = resolve({
      installState: 'failed',
      installUpdateKey: 'update-2',
      snapshot: snapshot({ availableUpdate: LATER_UPDATE, isUpdateAvailable: true }),
    });

    expect(prompt).toEqual({ kind: 'offered', updateKey: 'update-3' });
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
