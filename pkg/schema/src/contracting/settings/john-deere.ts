import { z } from 'zod';
import { DateIso } from '../../common/date.js';

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
