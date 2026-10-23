import { type AppRole, type Business, type PushKind, pushKinds, type UserAccessSummary } from '@pkg/schema';
import { getBusinessRole } from '../auth/authorization.js';

/**
 * An Android channel a Push Kind rings on, with the name the phone's notification settings show and how loudly it
 * rings: `max` interrupts, `default` sounds without a heads-up.
 */
export type PushChannel = { id: string; name: string; importance: 'max' | 'default' };

// The native default channel (`defaultChannel` in app.config.ts) carries the same id.
const WORKSHOP_PUSH_CHANNEL: PushChannel = { id: 'workshop', name: 'Workshop', importance: 'max' };
const NOTES_PUSH_CHANNEL: PushChannel = { id: 'notes', name: 'Notes', importance: 'default' };

export type PushKindDefinition = {
  business: Business;
  /** The toggle's label on the Settings page. */
  label: string;
  /** One sentence under the label: when it fires. */
  description: string;
  /** The roles this kind can reach; role membership is the opt-in, a mute the only per-person opt-out. A note kind
   * narrows this further to the people its thread reaches (`noteReaches`). */
  roles: readonly AppRole[];
  /** The Android channel it rings on. */
  channel: PushChannel;
};

/** Who a machine-down or service-due alert reaches: the workshop and Contracting management. */
const WORKSHOP_AND_MANAGEMENT_ROLES: readonly AppRole[] = [
  'workshop-manager',
  'contracting-manager',
  'contracting-admin',
  'super-admin',
];
/** Who a note can reach: those roles and the Foreman, narrowed per thread by `noteReaches`. */
const NOTE_ROLES: readonly AppRole[] = ['foreman', ...WORKSHOP_AND_MANAGEMENT_ROLES];

export const PUSH_KINDS: Record<PushKind, PushKindDefinition> = {
  'contracting.breakdown.code-red': {
    business: 'contracting',
    label: 'Code Red breakdowns',
    description: 'A machine is down.',
    roles: WORKSHOP_AND_MANAGEMENT_ROLES,
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
    roles: WORKSHOP_AND_MANAGEMENT_ROLES,
    channel: WORKSHOP_PUSH_CHANNEL,
  },
  'contracting.breakdown-note': {
    business: 'contracting',
    label: 'Breakdown notes',
    description: 'Someone added a note on a Breakdown you are part of.',
    roles: NOTE_ROLES,
    channel: NOTES_PUSH_CHANNEL,
  },
  'contracting.job-note': {
    business: 'contracting',
    label: 'Job notes',
    description: 'Someone added a note on a Job you are part of.',
    roles: NOTE_ROLES,
    channel: NOTES_PUSH_CHANNEL,
  },
};

/**
 * Whether this person holds a role the kind can reach: the one reach test, which dispatch mirrors as an SQL prefilter
 * and every narrower reach rule (`noteReaches`) starts from.
 */
export function canReceivePush(kind: PushKind, access: UserAccessSummary | null | undefined): boolean {
  const role = getBusinessRole(access, PUSH_KINDS[kind].business);
  return role !== null && PUSH_KINDS[kind].roles.includes(role);
}

/** The kinds any of this person's roles can reach, in registry order: what the Settings page lists. */
export function pushKindsFor(access: UserAccessSummary | null | undefined): PushKind[] {
  return pushKinds.filter((kind) => canReceivePush(kind, access));
}

/** Whether a push can reach this person at all: the only people the phone asks for notification permission. */
export const isPushRecipient = (access: UserAccessSummary | null | undefined) => pushKindsFor(access).length > 0;

/** The Android channels this person's kinds ring on, each once, so the phone creates each before registering. */
export function pushChannelsFor(access: UserAccessSummary | null | undefined): PushChannel[] {
  const kinds = pushKindsFor(access);
  if (kinds.length === 0) return [];
  // Every recipient gets the native default channel too, so a push that names no channel still rings.
  const channels = [WORKSHOP_PUSH_CHANNEL, ...kinds.map((kind) => PUSH_KINDS[kind].channel)];
  return [...new Map(channels.map((channel) => [channel.id, channel])).values()];
}
