import type { JobActivityItem } from '@pkg/schema';
import type React from 'react';

import { cn } from '@/lib/utils.js';

import { JobActivityEntry } from './JobActivityEntry.js';
import { groupJobActivityByDay } from './job-activity-timeline.js';

/**
 * The feed as a timeline: a heading per day, and under it a spine the day's entries hang off. The
 * day is what a reader navigates by — "what happened yesterday" rather than "the eleventh entry" —
 * so it gets a rule and a heading, and the spine restarts beneath each one.
 */
export const JobActivityTimeline: React.FC<{ hideDetail?: boolean; items: JobActivityItem[] }> = ({
  hideDetail = false,
  items,
}) => (
  <div className="grid gap-6">
    {groupJobActivityByDay(items).map((group, index) => (
      // The page already rules off its own header, so only a day that follows another draws one.
      <section className={cn('grid gap-3', index > 0 && 'border-t border-border/70 pt-6')} key={group.day}>
        <h2 className="font-medium text-xs tracking-[0.18em] uppercase">{group.label}</h2>
        {/* Entries only — each draws the spine down to the next, and the last one draws none. */}
        <div className="grid gap-5">
          {group.items.map((item) => (
            <JobActivityEntry hideDetail={hideDetail} item={item} key={`${item.type}:${item.id}`} />
          ))}
        </div>
      </section>
    ))}
  </div>
);
