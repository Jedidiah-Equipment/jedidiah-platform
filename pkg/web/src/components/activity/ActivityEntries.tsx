import { type ActivityEventPresentation, statusBadgeColorClassNames } from '@pkg/domain';
import type { DateIso } from '@pkg/schema';
import type { TablerIcon } from '@tabler/icons-react';
import type React from 'react';

import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';
import { cn } from '@/lib/utils.js';

import { ActivityEntryShell, ActivityEventMarker, ActivityNoteMarker } from './ActivityEntryShell.js';
import { ActivityNoteBubble } from './ActivityNoteBubble.js';

/**
 * What was said, in either business's feed: a filled node, the author's face, and a bubble whose tail points back at
 * them. `footer` names where it was said when the feed is not already there.
 */
export function ActivityNoteEntry({
  author,
  footer,
  occurredAt,
  text,
}: {
  author: { name: string; thumbnailDataUrl: string | null };
  footer?: React.ReactNode;
  occurredAt: DateIso;
  text: string;
}) {
  return (
    <ActivityEntryShell
      marker={<ActivityNoteMarker />}
      occurredAt={occurredAt}
      who={
        <EntityThumbnail
          className="z-10"
          label={author.name}
          shape="circle"
          thumbnailDataUrl={author.thumbnailDataUrl}
        />
      }
    >
      <ActivityNoteBubble author={author.name} footer={footer} text={text} />
    </ActivityEntryShell>
  );
}

/** The strip under a note naming the record it was said on; controls inside it stay clickable. */
export function ActivityNoteFooter({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative z-10 flex min-w-0 flex-wrap items-center gap-2 border-t border-border/70 bg-muted/40 px-3.5 py-1.5 text-muted-foreground text-xs">
      {children}
    </div>
  );
}

/**
 * What was done, flat beside a hollow node: the record's icon in its tone, who did what, an optional `context` line
 * naming the record when the sentence does not, and the fact beyond it. `link` is a stretched link over the entry.
 */
export function ActivityEventEntry({
  context,
  icon: Icon,
  link,
  occurredAt,
  presentation,
}: {
  context?: React.ReactNode;
  icon: TablerIcon;
  link?: React.ReactNode;
  occurredAt: DateIso;
  presentation: ActivityEventPresentation;
}) {
  const tone = statusBadgeColorClassNames[presentation.tone];
  return (
    <ActivityEntryShell
      dense
      link={link}
      marker={<ActivityEventMarker />}
      occurredAt={occurredAt}
      who={
        // A record, not a person: a rounded square.
        <span className={cn('flex size-8 items-center justify-center rounded-lg border', tone.chip, tone.text)}>
          <Icon aria-hidden className="size-3.5" />
        </span>
      }
    >
      <div className="min-w-0">
        <p className="text-sm leading-6">
          <span className="font-medium">{presentation.actorName}</span> {presentation.sentence}
        </p>
        {context}
        {presentation.detail === null ? null : (
          <p className="text-sm leading-6 text-muted-foreground whitespace-pre-wrap">{presentation.detail}</p>
        )}
      </div>
    </ActivityEntryShell>
  );
}
