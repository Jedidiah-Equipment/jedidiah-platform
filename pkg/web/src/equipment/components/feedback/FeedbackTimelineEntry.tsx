import { getFirstName } from '@pkg/domain';
import type { DateIso } from '@pkg/schema';
import type { FeedbackSubmitter } from '@pkg/schema/equipment';
import type React from 'react';
import { ActivityEntryShell, ActivityNoteMarker } from '@/components/activity/ActivityEntryShell.js';
import { EntityThumbnail } from '@/components/thumbnail/EntityThumbnail.js';

/** Shared attribution, time and note layout on Jobs and Purchase Orders. */
export const FeedbackTimelineEntry: React.FC<{
  children: React.ReactNode;
  link?: React.ReactNode;
  occurredAt: DateIso;
  submitter: FeedbackSubmitter;
}> = ({ children, link, occurredAt, submitter }) => (
  <ActivityEntryShell
    link={link}
    marker={<ActivityNoteMarker />}
    occurredAt={occurredAt}
    who={
      <EntityThumbnail
        className="z-10"
        label={getFirstName(submitter.name)}
        shape="circle"
        thumbnailDataUrl={submitter.thumbnailDataUrl}
      />
    }
  >
    {children}
  </ActivityEntryShell>
);
