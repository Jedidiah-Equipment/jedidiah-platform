import type { PushRegistrationOutcome } from './register-push';

/** Mobile web has no push channel: nothing registers and nothing needs forgetting. */
export async function registerForPush(_options: unknown): Promise<PushRegistrationOutcome> {
  return 'unsupported';
}

export async function unregisterPush(_unregister: unknown): Promise<void> {}
