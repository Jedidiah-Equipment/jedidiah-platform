import { z } from 'zod';

/** Every Push Kind the platform can send; the registry of what each one is lives in `@pkg/domain`. */
export const pushKinds = [
  'contracting.breakdown.code-red',
  'contracting.breakdown.code-green',
  'contracting.service-due-soon',
  'contracting.breakdown-note',
  'contracting.job-note',
] as const;
export type PushKind = (typeof pushKinds)[number];

export const PushKindSchema = z.enum(pushKinds);

/** The Push Kinds one User has muted in App Settings. */
export const MutedPushKinds = z.array(PushKindSchema);

export type PushPreferences = z.infer<typeof PushPreferences>;
export const PushPreferences = z.object({ muted: MutedPushKinds });

export type PushPreferencesSetInput = z.infer<typeof PushPreferencesSetInput>;
export const PushPreferencesSetInput = PushPreferences.strict();
