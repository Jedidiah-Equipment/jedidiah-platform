import type { HelpTopic } from '@pkg/domain';
import type { Href } from 'expo-router';
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
  fallback,
  helpTopic,
  subtitle,
  title,
}: {
  avatar?: React.ReactNode;
  badge?: React.ReactNode;
  fallback: Href;
  helpTopic?: HelpTopic;
  subtitle: string;
  title: string;
}) {
  return (
    <SecondaryToolbar
      actions={<ProfileMenuButton helpTopic={helpTopic} />}
      avatar={avatar}
      badge={badge}
      fallback={fallback}
      subtitle={subtitle}
      title={title}
    />
  );
}
