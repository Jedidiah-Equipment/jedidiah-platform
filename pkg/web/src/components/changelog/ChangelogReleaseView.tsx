import { formatDate } from '@pkg/domain';
import type { Changelog, ChangelogSection, ChangelogSurface } from '@pkg/schema';
import type React from 'react';

/** Surface display order and labels for the dialog. */
const CHANGELOG_SURFACE_ORDER = ['app', 'lander', 'mobile'] as const satisfies readonly ChangelogSurface[];

const changelogSurfaceLabels: Record<ChangelogSurface, string> = {
  app: 'App',
  lander: 'Lander',
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
  return (
    <div className="flex flex-col gap-4">
      <p className="text-xs font-medium text-muted-foreground">Released {formatDate(changelog.releasedAt)}</p>
      {orderedChangelogSections(changelog).map((section) => (
        <section className="flex flex-col gap-2" key={section.surface}>
          <h3 className="font-heading text-sm font-medium">{changelogSurfaceLabels[section.surface]}</h3>
          <ul className="flex flex-col gap-2">
            {section.entries.map((entry) => (
              <li className="flex flex-col gap-0.5" key={entry.title}>
                <span className="text-sm font-medium">{entry.title}</span>
                <span className="text-sm text-muted-foreground">{entry.description}</span>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
};
