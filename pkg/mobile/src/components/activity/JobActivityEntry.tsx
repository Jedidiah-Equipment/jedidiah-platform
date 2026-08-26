import {
  formatDate,
  getFirstName,
  JOB_ACTIVITY_EVENT_SENTENCES,
  jobWorkTimeActivityDetail,
  jobWorkTimeActivitySentence,
} from '@pkg/domain';
import type { GeneralFeedbackActivityItem, JobActivityItem, JobChangeActivityItem } from '@pkg/schema';
import {
  IconCheck,
  IconClock,
  IconFileText,
  IconPencil,
  IconPlus,
  type Icon as TablerIcon,
} from '@tabler/icons-react-native';
import { useRouter } from 'expo-router';
import type { ReactNode } from 'react';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Avatar } from '@/components/Avatar';
import { CustomerName } from '@/components/CustomerName';
import { OfferingAvatar } from '@/components/OfferingAvatar';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export function JobActivityEntry({ item, last }: { item: JobActivityItem; last: boolean }) {
  if (item.type === 'general-feedback') {
    return <FeedbackEntry item={item} last={last} />;
  }

  return <JobEventEntry item={item} last={last} />;
}

function FeedbackEntry({ item, last }: { item: GeneralFeedbackActivityItem; last: boolean }) {
  const [expanded, setExpanded] = useState(false);
  const expandable = item.feedback.text.length > 180;

  return (
    <ActivityEntryShell
      last={last}
      marker={<View className="h-2 w-2 rounded-full bg-primary" />}
      occurredAt={item.occurredAt}
      who={
        <View accessible accessibilityLabel={item.feedback.submitter.name}>
          <Avatar
            className="h-7 w-7 rounded-full"
            name={item.feedback.submitter.name}
            textClassName="text-[9px]"
            uri={item.feedback.submitter.thumbnailDataUrl}
          />
        </View>
      }
    >
      <View className="relative min-w-0">
        <View className="absolute -left-1 top-3 h-3 w-3 rotate-45 border-b border-l border-border bg-surface" />
        <View className="overflow-hidden rounded-xl border border-border bg-surface">
          <Text
            className="px-3 py-2.5 text-sm leading-5 text-surface-foreground"
            // Never clamp without a toggle: short text can still exceed four lines at narrow widths
            // or with larger accessibility text.
            {...(expandable && !expanded ? { numberOfLines: 4 } : {})}
          >
            {item.feedback.text}
          </Text>
          {expandable ? (
            <Pressable className="self-start px-3 pb-2" onPress={() => setExpanded((value) => !value)}>
              <Text className="text-xs text-primary" weight="semibold">
                {expanded ? 'Show less' : 'Show more'}
              </Text>
            </Pressable>
          ) : null}
          <JobDetail item={item} />
        </View>
      </View>
    </ActivityEntryShell>
  );
}

function JobEventEntry({ item, last }: { item: JobChangeActivityItem; last: boolean }) {
  const router = useRouter();
  const presentation = getJobEventPresentation(item);
  const actorName = item.actor ? getFirstName(item.actor.name) : 'System';
  const EventIcon = presentation.icon;

  return (
    <ActivityEntryShell
      last={last}
      marker={<View className="h-2 w-2 rounded-full border border-muted-foreground bg-background" />}
      occurredAt={item.occurredAt}
      who={
        <View className="h-7 w-7 items-center justify-center rounded-full border border-border bg-muted">
          <Icon className="text-muted-foreground" icon={EventIcon} size={13} strokeWidth={1.8} />
        </View>
      }
    >
      <Pressable
        accessibilityHint="Opens Job details"
        accessibilityLabel={`${actorName} ${presentation.sentence} on ${item.job.code}`}
        accessibilityRole="button"
        className="min-w-0 flex-1 rounded-lg px-1 py-0.5 active:bg-muted"
        onPress={() => router.push({ pathname: '/jobs/[jobId]', params: { jobId: item.job.id } })}
      >
        <Text className="text-sm leading-5 text-foreground" numberOfLines={2}>
          <Text weight="semibold">{actorName}</Text> {presentation.sentence}
        </Text>
        <View className="mt-0.5 min-w-0 flex-row items-center gap-1.5">
          <Text className="shrink-0 text-xs text-muted-foreground" mono>
            {item.job.code}
          </Text>
          <Text className="min-w-0 flex-1 text-xs text-muted-foreground" numberOfLines={1}>
            {item.job.displayName}
          </Text>
        </View>
        {presentation.detail === null ? null : (
          <Text className="mt-0.5 text-xs leading-4 text-muted-foreground" numberOfLines={2}>
            {presentation.detail}
          </Text>
        )}
      </Pressable>
    </ActivityEntryShell>
  );
}

function ActivityEntryShell({
  children,
  last,
  marker,
  occurredAt,
  who,
}: {
  children: ReactNode;
  last: boolean;
  marker: ReactNode;
  occurredAt: string;
  who: ReactNode;
}) {
  return (
    <View className={last ? 'relative min-w-0 pb-6' : 'relative min-w-0 pb-3.5'}>
      {last ? null : <View className="absolute -bottom-3 top-3.5 left-1 w-px bg-border" />}
      <View className="h-7 flex-row items-center">
        <View className="h-2 w-2 items-center justify-center">{marker}</View>
        <Text className="ml-1.5 text-[11px] text-muted-foreground" mono>
          {formatDate(occurredAt, 'HH:mm')}
        </Text>
      </View>
      <View className="mt-1 min-w-0 flex-row items-start pl-3">
        <View className="mr-2 h-7 w-7 shrink-0 items-center justify-center">{who}</View>
        <View className="min-w-0 flex-1">{children}</View>
      </View>
    </View>
  );
}

function JobDetail({ item }: { item: GeneralFeedbackActivityItem }) {
  const router = useRouter();

  return (
    <Pressable
      accessibilityHint="Opens Job details"
      accessibilityLabel={`Open ${item.job.code} ${item.job.displayName}`}
      accessibilityRole="button"
      className="min-w-0 flex-row items-center gap-1.5 border-t border-border bg-muted/50 px-2.5 py-1.5 active:bg-muted"
      onPress={() => router.push({ pathname: '/jobs/[jobId]', params: { jobId: item.job.id } })}
    >
      <OfferingAvatar
        className="h-5 w-5 rounded-md"
        iconSize={11}
        kind={item.job.offeringKind}
        name={item.job.displayName}
        uri={item.job.thumbnailDataUrl}
      />
      <Text className="shrink-0 text-[11px] text-muted-foreground" mono>
        {item.job.code}
      </Text>
      <Text className="min-w-0 flex-1 text-[11px] text-muted-foreground" numberOfLines={1}>
        {item.job.displayName}
      </Text>
      <CustomerName
        className="max-w-24 shrink text-[11px]"
        companyName={item.job.customerCompanyName}
        numberOfLines={1}
      />
    </Pressable>
  );
}

type JobEventPresentation = {
  detail: string | null;
  icon: TablerIcon;
  sentence: string;
};

function getJobEventPresentation(item: JobChangeActivityItem): JobEventPresentation {
  switch (item.type) {
    case 'job-created':
      return { detail: null, icon: IconPlus, sentence: JOB_ACTIVITY_EVENT_SENTENCES.created };
    case 'job-description-updated':
      return {
        detail: item.description,
        icon: IconPencil,
        sentence:
          item.description === null
            ? JOB_ACTIVITY_EVENT_SENTENCES.descriptionCleared
            : JOB_ACTIVITY_EVENT_SENTENCES.descriptionChanged,
      };
    case 'job-completed':
      return {
        detail: formatDate(item.completedOn),
        icon: IconCheck,
        sentence: JOB_ACTIVITY_EVENT_SENTENCES.completed,
      };
    case 'job-document-added':
      return {
        detail: item.document.filename,
        icon: IconFileText,
        sentence: JOB_ACTIVITY_EVENT_SENTENCES.documentAdded,
      };
    case 'job-work-time-updated':
      return {
        detail: jobWorkTimeActivityDetail(item.timing),
        icon: IconClock,
        sentence: jobWorkTimeActivitySentence(item),
      };
  }
}
