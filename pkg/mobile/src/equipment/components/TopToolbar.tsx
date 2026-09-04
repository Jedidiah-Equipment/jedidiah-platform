import type { HelpTopic } from '@pkg/domain';
import type React from 'react';
import { ProfileMenuButton } from '@/components/ProfileMenuButton';
import { MainToolbar, SecondaryToolbar } from '@/components/TopToolbar';
import { AssistantEntryButton } from '@/equipment/components/assistant/AssistantEntryButton';
import type { MainTabParent } from '@/equipment/lib/toolbar-navigation';

export function MainTabToolbar({
  assistantParent,
  helpTopic,
  subtitle,
  title,
}: {
  assistantParent?: MainTabParent;
  helpTopic?: HelpTopic;
  subtitle: string;
  title: string;
}) {
  return (
    <MainToolbar
      actions={
        <>
          {assistantParent ? <AssistantEntryButton parent={assistantParent} /> : null}
          <ProfileMenuButton helpTopic={helpTopic} />
        </>
      }
      subtitle={subtitle}
      title={title}
    />
  );
}

export function SecondaryPageToolbar({
  avatar,
  badge,
  helpTopic,
  onBack,
  parentLabel,
  subtitle,
  title,
}: {
  avatar?: React.ReactNode;
  badge?: React.ReactNode;
  helpTopic?: HelpTopic;
  onBack: () => void;
  parentLabel: string;
  subtitle: string;
  title: string;
}) {
  return (
    <SecondaryToolbar
      actions={<ProfileMenuButton helpTopic={helpTopic} />}
      avatar={avatar}
      badge={badge}
      onBack={onBack}
      parentLabel={parentLabel}
      subtitle={subtitle}
      title={title}
    />
  );
}
