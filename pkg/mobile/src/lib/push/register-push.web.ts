import type { PushRegistrationOutcome } from './register-push';

/** Mobile web has no push channel: nothing registers. */
export async function registerForPush(_options: unknown): Promise<PushRegistrationOutcome> {
  return 'unsupported';
}
