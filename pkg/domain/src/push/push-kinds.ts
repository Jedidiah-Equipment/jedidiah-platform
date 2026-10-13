import { type AppRole, type Business, type PushKind, pushKinds, type UserAccessSummary } from '@pkg/schema';
import { getBusinessRole } from '../auth/authorization.js';

/** The one Android channel workshop pushes ring on; the native default channel carries the same id. */
export const WORKSHOP_PUSH_CHANNEL_ID = 'workshop';

/** An Android channel a Push Kind rings on, with the name the phone's notification settings show. */
export type PushChannel = { id: string; name: string };

const WORKSHOP_PUSH_CHANNEL: PushChannel = { id: WORKSHOP_PUSH_CHANNEL_ID, name: 'Workshop' };

export type PushKindDefinition = {
  business: Business;
  /** The toggle's label on the Settings page. */
  label: string;
  /** One sentence under the label: when it fires. */
  description: string;
  /** The roles this kind can reach; role membership is the opt-in, a mute the only per-person opt-out. */
  roles: readonly AppRole[];
  /** The Android channel it rings on. */
  channel: PushChannel;
};

export const PUSH_KINDS: Record<PushKind, PushKindDefinition> = {
  'contracting.breakdown.code-red': {
    business: 'contracting',
    label: 'Code Red breakdowns',
    description: 'A machine is down.',
    roles: ['workshop-manager', 'contracting-manager', 'contracting-admin', 'super-admin'],
    channel: WORKSHOP_PUSH_CHANNEL,
  },
  'contracting.breakdown.code-green': {
    business: 'contracting',
    label: 'Code Green breakdowns',
    description: 'A problem was reported on a machine that is still working.',
    roles: ['workshop-manager'],
    channel: WORKSHOP_PUSH_CHANNEL,
  },
  'contracting.service-due-soon': {
    business: 'contracting',
    label: 'Service due soon',
    description: 'A reading brought a machine within the service threshold.',
    roles: ['workshop-manager'],
    channel: WORKSHOP_PUSH_CHANNEL,
  },
};

/** The kinds any of this person's roles can reach, in registry order: what the Settings page lists. */
export function pushKindsFor(access: UserAccessSummary | null | undefined): PushKind[] {
  return pushKinds.filter((kind) => {
    const role = getBusinessRole(access, PUSH_KINDS[kind].business);
    return role !== null && PUSH_KINDS[kind].roles.includes(role);
  });
}

/** Whether a push can reach this person at all: the only people the phone asks for notification permission. */
export const isPushRecipient = (access: UserAccessSummary | null | undefined) => pushKindsFor(access).length > 0;

/** The Android channels this person's kinds ring on, each once, so the phone creates each before registering. */
export function pushChannelsFor(access: UserAccessSummary | null | undefined): PushChannel[] {
  const channels = new Map(pushKindsFor(access).map((kind) => [PUSH_KINDS[kind].channel.id, PUSH_KINDS[kind].channel]));
  return [...channels.values()];
}
