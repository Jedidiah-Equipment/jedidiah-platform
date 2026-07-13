import { z } from 'zod';

import { DateIso } from '../common/date.js';
import { requiredTrimmedText } from '../common/text.js';

export type ChangelogSurface = z.infer<typeof ChangelogSurface>;
export const ChangelogSurface = z.enum(['app', 'lander', 'mobile']);

export type ChangelogEntry = z.infer<typeof ChangelogEntry>;
export const ChangelogEntry = z.object({
  title: requiredTrimmedText(),
  description: requiredTrimmedText(),
});

export type ChangelogSection = z.infer<typeof ChangelogSection>;
export const ChangelogSection = z.object({
  surface: ChangelogSurface,
  entries: z.array(ChangelogEntry).min(1),
});

export type Changelog = z.infer<typeof Changelog>;
export const Changelog = z
  .object({
    releasedAt: DateIso,
    sections: z.array(ChangelogSection).min(1),
  })
  .refine(
    (changelog) => new Set(changelog.sections.map((section) => section.surface)).size === changelog.sections.length,
    {
      message: 'Each Surface may appear at most once',
      path: ['sections'],
    },
  );
