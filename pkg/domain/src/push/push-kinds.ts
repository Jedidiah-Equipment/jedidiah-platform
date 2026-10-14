import { type AppRole, type Business, type PushKind, pushKinds, type UserAccessSummary } from '@pkg/schema';
import { getBusinessRole } from '../auth/authorization.js';

/** An Android channel a Push Kind rings on, with the name the phone's notification settings show. */
export type PushChannel = { id: string; name: string };

// The native default channel (`defaultChannel` in app.config.ts) carries the same id.
const WORKSHOP_PUSH_CHANNEL: PushChannel = { id: 'workshop', name: 'Workshop' };

export const NOTES_PUSH_CHANNEL_ID = 'notes';
const NOTES_PUSH_CHANNEL: PushChannel = { id: NOTES_PUSH_CHANNEL_ID, name: 'Notes' };

export type PushKindDefinition = {
  business: Business;
  /** The toggle's label on the Settings page. */
  label: string;
  /** One sentence under the label: when it fires. */
  description: string;
  /** The roles this kind can ever reach, for Settings and permission prompts. Note recipients are the narrower
   * thread participant set plus its always-notified roles; a mute opts out of either route. */
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
  'contracting.breakdown-note': {
    business: 'contracting',
    label: 'Breakdown notes',
    description: 'Someone added a note on a Breakdown you are part of.',
    roles: ['foreman', 'workshop-manager', 'contracting-manager', 'contracting-admin', 'super-admin'],
    channel: NOTES_PUSH_CHANNEL,
  },
  'contracting.job-note': {
    business: 'contracting',
    label: 'Job notes',
    description: 'Someone added a note on a Job you are part of.',
    roles: ['foreman', 'workshop-manager', 'contracting-manager', 'contracting-admin', 'super-admin'],
    channel: NOTES_PUSH_CHANNEL,
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
  const kinds = pushKindsFor(access);
  if (kinds.length === 0) return [];
  // Provision the native default channel for every recipient, alongside their kinds' channels.
  const channels = new Map([[WORKSHOP_PUSH_CHANNEL.id, WORKSHOP_PUSH_CHANNEL]]);
  for (const kind of kinds) channels.set(PUSH_KINDS[kind].channel.id, PUSH_KINDS[kind].channel);
  return [...channels.values()];
}
