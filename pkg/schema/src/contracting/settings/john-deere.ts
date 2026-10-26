import { z } from 'zod';
import { DateIso } from '../../common/date.js';
import { UUID } from '../../common/uuid.js';
import { CategoryColour, CategoryIconKey } from '../fleet/fleet.js';
import { ReadingValue } from '../readings/reading-value.js';

/** As stored: `pending` while an OAuth round trip is open. */
export const johnDeereConnectionStatuses = ['not-connected', 'pending', 'connected', 'needs-reconnect'] as const;
export type JohnDeereConnectionStatus = (typeof johnDeereConnectionStatuses)[number];

/** As served: the three states the glossary names. An open round trip is still Not connected. */
export const JohnDeereConnectionState = z.enum(['not-connected', 'connected', 'needs-reconnect']);
export type JohnDeereConnectionState = z.infer<typeof JohnDeereConnectionState>;

/** An Operations Center organization the connection can read: one that has granted the application access. */
export const JohnDeereOrganization = z.object({ id: z.string().min(1), name: z.string() });
export type JohnDeereOrganization = z.infer<typeof JohnDeereOrganization>;

/** Where the OAuth round trip finished, as the callback hands it back to the John Deere tab. */
export const johnDeereConnectResults = ['connected', 'not-connected', 'error'] as const;
export const JohnDeereConnectResult = z.enum(johnDeereConnectResults);
export type JohnDeereConnectResult = z.infer<typeof JohnDeereConnectResult>;

/**
 * The John Deere tab's connection card. `configured` is false when the environment has no application
 * keys, and then nothing else is read.
 */
export const JohnDeereConnectionView = z.object({
  configured: z.boolean(),
  status: JohnDeereConnectionState,
  organizations: z.array(JohnDeereOrganization),
  connectedBy: z.object({ id: z.string(), name: z.string() }).nullable(),
  connectedAt: DateIso.nullable(),
  lastPolledAt: DateIso.nullable(),
  lastError: z.string().nullable(),
});
export type JohnDeereConnectionView = z.infer<typeof JohnDeereConnectionView>;

/** A machine the connected organization lists that no Machine is linked to, with what it last reported. */
export const JohnDeereUnlinkedMachine = z.object({
  equipmentId: z.string().min(1),
  principalId: z.number().int(),
  name: z.string(),
  /** The PIN. */
  serialNumber: z.string().nullable(),
  make: z.string().nullable(),
  model: z.string().nullable(),
  modelYear: z.string().nullable(),
  /** Null when John Deere has no engine hours for it. */
  lastHours: z.number().nullable(),
  lastReportTime: DateIso.nullable(),
});
export type JohnDeereUnlinkedMachine = z.infer<typeof JohnDeereUnlinkedMachine>;

/** An active John Deere Link, beside the Machine it feeds. */
export const JohnDeereLinkView = z.object({
  id: UUID,
  machine: z.object({
    id: UUID,
    code: z.string(),
    categoryIcon: CategoryIconKey,
    categoryColour: CategoryColour,
    retiredAt: DateIso.nullable(),
    latestReadingHours: ReadingValue.nullable(),
    latestReadingAt: DateIso.nullable(),
  }),
  equipmentId: z.string(),
  principalId: z.number().int(),
  deereName: z.string(),
  serialNumber: z.string().nullable(),
  linkedAt: DateIso,
  /** The organization no longer lists the machine, or lists it archived. */
  lost: z.boolean(),
  lastPolledAt: DateIso.nullable(),
  lastReportTime: DateIso.nullable(),
  lastValue: ReadingValue.nullable(),
  lastError: z.string().nullable(),
});
export type JohnDeereLinkView = z.infer<typeof JohnDeereLinkView>;

export const JohnDeereLinkCreateInput = z.object({ machineId: UUID, equipmentId: z.string().min(1) }).strict();
export type JohnDeereLinkCreateInput = z.infer<typeof JohnDeereLinkCreateInput>;
export const JohnDeereLinkRemoveInput = z.object({ id: UUID }).strict();
export type JohnDeereLinkRemoveInput = z.infer<typeof JohnDeereLinkRemoveInput>;

/** What one run of the hourly poll did, as Refresh now reports it. `skipped` is set when the run never started. */
export const JohnDeerePollSummary = z.object({
  skipped: z.enum(['not-connected', 'no-links']).nullable(),
  /** Links asked for their engine hours. */
  polled: z.number().int(),
  stored: z.number().int(),
  moved: z.number().int(),
  unchanged: z.number().int(),
  lost: z.number().int(),
  /** Links that failed this run, each with its error kept on the Link. */
  errors: z.number().int(),
  /** The error that ended the run early, when one did. */
  endedBy: z.string().nullable(),
});
export type JohnDeerePollSummary = z.infer<typeof JohnDeerePollSummary>;
