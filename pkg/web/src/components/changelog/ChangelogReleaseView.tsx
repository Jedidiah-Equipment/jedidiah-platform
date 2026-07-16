import { formatDate } from '@pkg/domain';
import type { Changelog, ChangelogSection, ChangelogSurface } from '@pkg/schema';
import { IconChevronDown } from '@tabler/icons-react';
import type React from 'react';
import { useState } from 'react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible.js';

/** Surface display order and labels for the dialog. */
const CHANGELOG_SURFACE_ORDER = ['app', 'lander', 'mobile'] as const satisfies readonly ChangelogSurface[];
const COLLAPSED_ENTRY_COUNT = 3;

const changelogSurfaceLabels: Record<ChangelogSurface, string> = {
  app: 'App',
  lander: 'Website',
  mobile: 'Mobile',
};

/** A release's sections in canonical Surface order, omitting Surfaces the release does not touch. */
function orderedChangelogSections(changelog: Changelog): ChangelogSection[] {
  return CHANGELOG_SURFACE_ORDER.flatMap((surface) =>
    changelog.sections.filter((section) => section.surface === surface),
  );
}

type ChangelogReleaseViewProps = {
  changelog: Changelog;
};

export const ChangelogReleaseView: React.FC<ChangelogReleaseViewProps> = ({ changelog }) => {
  const sections = orderedChangelogSections(changelog);
  const [openSurface, setOpenSurface] = useState<ChangelogSurface | null>(sections[0]?.surface ?? null);
  const [expandedSurfaces, setExpandedSurfaces] = useState<ReadonlySet<ChangelogSurface>>(() => new Set());
  const entryCount = sections.reduce((total, section) => total + section.entries.length, 0);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-1.5">
        <p className="text-sm font-medium text-muted-foreground">Released {formatDate(changelog.releasedAt)}</p>
        <p className="text-[15px] text-foreground/80">
          {entryCount} {entryCount === 1 ? 'improvement' : 'improvements'} across {sections.length}{' '}
          {sections.length === 1 ? 'area' : 'areas'}
        </p>
      </div>

      <div className="flex flex-col gap-3">
        {sections.map((section) => {
          const isOpen = openSurface === section.surface;
          const isExpanded = expandedSurfaces.has(section.surface);
          const visibleEntries = isExpanded ? section.entries : section.entries.slice(0, COLLAPSED_ENTRY_COUNT);
          const remainingEntryCount = section.entries.length - visibleEntries.length;
          const label = changelogSurfaceLabels[section.surface];

          return (
            <Collapsible
              className="overflow-hidden rounded-xl bg-muted/60"
              key={section.surface}
              onOpenChange={(nextOpen) => setOpenSurface(nextOpen ? section.surface : null)}
              open={isOpen}
            >
              <CollapsibleTrigger className="flex min-h-14 w-full items-center justify-between gap-4 px-4 text-left outline-none transition-colors hover:bg-muted focus-visible:ring-3 focus-visible:ring-ring/50">
                <span className={`font-heading text-base font-medium ${isOpen ? 'text-primary' : 'text-foreground'}`}>
                  {label}
                </span>
                <span className="flex items-center gap-2 text-xs font-medium text-muted-foreground">
                  {section.entries.length} {section.entries.length === 1 ? 'improvement' : 'improvements'}
                  <IconChevronDown
                    aria-hidden="true"
                    className={`size-4 transition-transform ${isOpen ? 'rotate-180' : ''}`}
                  />
                </span>
              </CollapsibleTrigger>

              <CollapsibleContent className="px-4 pb-4">
                <ul className="flex flex-col gap-3">
                  {visibleEntries.map((entry) => (
                    <li className="flex flex-col gap-0.5" key={entry.title}>
                      <span className="text-sm font-medium text-foreground">{entry.title}</span>
                      <span className="text-[13px] leading-relaxed text-muted-foreground">{entry.description}</span>
                    </li>
                  ))}
                </ul>

                {remainingEntryCount > 0 ? (
                  <button
                    className="mt-3 text-left text-xs font-medium text-primary outline-none hover:underline focus-visible:ring-3 focus-visible:ring-ring/50"
                    onClick={() => {
                      setExpandedSurfaces((current) => new Set(current).add(section.surface));
                    }}
                    type="button"
                  >
                    View {remainingEntryCount} more {label} {remainingEntryCount === 1 ? 'improvement' : 'improvements'}
                  </button>
                ) : null}
              </CollapsibleContent>
            </Collapsible>
          );
        })}
      </div>
    </div>
  );
};
