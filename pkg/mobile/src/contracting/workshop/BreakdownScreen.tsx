import {
  breakdownStatusColorClassNames,
  breakdownStatusLabels,
  breakdownSubjectKindLabels,
  breakdownUrgencyColorClassNames,
  breakdownUrgencyLabels,
  fieldJobAccessMode,
} from '@pkg/domain/contracting';
import { BreakdownDescription, type BreakdownDetail } from '@pkg/schema/contracting';
import { IconMapPin } from '@tabler/icons-react-native';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateText } from '@/components/DateText';
import { SECONDARY_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { StatusBadge } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { CategoryIcon } from '@/contracting/components/CategoryIcon';
import { useVoiceSession } from '@/contracting/voice/use-voice-session';
import { VoiceTextArea } from '@/contracting/voice/VoiceTextArea';
import { useSessionAccessSummary } from '@/lib/auth-session';
import { useBusyAction } from '@/lib/use-busy-action';
import { BreakdownNotesCard } from './BreakdownNotesCard';
import { BreakdownPhotosCard } from './BreakdownPhotosCard';
import { BreakdownWorkshopCard } from './BreakdownWorkshopCard';
import { BREAKDOWN_SAVE_FAILED, useBreakdown, useBreakdownMutation } from './use-breakdowns';
import { VerdictButton } from './VerdictButton';

export default function BreakdownScreen() {
  const { breakdownId } = useLocalSearchParams<{ breakdownId: string }>();
  const query = useBreakdown(breakdownId);
  const breakdown = query.data;
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title={breakdown?.subject.code ?? 'Breakdown'}
        subtitle={breakdown ? breakdownUrgencyLabels[breakdown.urgency] : 'CONTRACTING'}
        parentLabel="Workshop"
        onBack={() => router.navigate('/contracting/workshop' as Href)}
        helpTopic="contractingMobileBreakdown"
      />
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ ...SECONDARY_PAGE_CONTENT_STYLE, gap: 16 }}
      >
        {breakdown ? (
          <BreakdownSections breakdown={breakdown} />
        ) : (
          <Text className="text-muted-foreground">
            {!query.canRead
              ? 'Your role cannot view Breakdowns.'
              : query.gone
                ? 'This Breakdown is not one of yours, or it no longer exists.'
                : query.isError
                  ? 'This Breakdown could not be loaded.'
                  : 'Loading Breakdown…'}
          </Text>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

function BreakdownSections({ breakdown }: { breakdown: BreakdownDetail }) {
  return (
    <>
      <HeaderCard breakdown={breakdown} />
      {breakdown.dispatchHints.length ? <DispatchHints breakdown={breakdown} /> : null}
      <DescriptionCard breakdown={breakdown} />
      <BreakdownPhotosCard breakdown={breakdown} />
      <BreakdownWorkshopCard breakdown={breakdown} />
      <BreakdownNotesCard breakdown={breakdown} />
    </>
  );
}

function HeaderCard({ breakdown }: { breakdown: BreakdownDetail }) {
  const access = useSessionAccessSummary();
  const jobMode = fieldJobAccessMode(access);
  // A Foreman opens only Jobs he is Foreman of; this Breakdown may be his report on someone else's.
  const canOpenJob = jobMode === 'all' || (jobMode === 'own' && breakdown.jobForemanUserId === access?.userId);
  const { subject, latitude, longitude } = breakdown;
  return (
    <Card>
      <View className="flex-row flex-wrap gap-1">
        <StatusBadge
          classNames={breakdownUrgencyColorClassNames[breakdown.urgency]}
          label={breakdownUrgencyLabels[breakdown.urgency]}
        />
        <StatusBadge
          classNames={breakdownStatusColorClassNames[breakdown.status]}
          label={breakdownStatusLabels[breakdown.status]}
        />
      </View>
      <View className="flex-row items-center gap-3">
        <CategoryIcon icon={subject.categoryIcon} colour={subject.categoryColour} size={24} />
        <View className="min-w-0 flex-1">
          <Text className="text-lg text-foreground" weight="bold">
            {subject.code}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {breakdownSubjectKindLabels[subject.kind]} · {subject.categoryName}
          </Text>
        </View>
      </View>
      {breakdown.jobId && breakdown.jobNumber ? (
        <Pressable
          accessibilityRole={canOpenJob ? 'link' : undefined}
          disabled={!canOpenJob}
          onPress={() => router.navigate(`/contracting/jobs/${breakdown.jobId}` as Href)}
        >
          <Text className={canOpenJob ? 'text-primary' : 'text-foreground'} weight="semibold">
            {breakdown.jobNumber}
            {breakdown.farmName ? ` · ${breakdown.farmName}` : ''}
          </Text>
        </Pressable>
      ) : (
        <Text className="text-muted-foreground">Not on a Job</Text>
      )}
      <Text className="text-sm text-muted-foreground">
        Reported <DateText className="text-sm text-muted-foreground" date={breakdown.reportedAt} format="medium" /> by{' '}
        {breakdown.reporterName}
      </Text>
      {latitude !== null && longitude !== null ? (
        <Button
          title="Open in Maps"
          icon={IconMapPin}
          onPress={() => void Linking.openURL(`https://maps.google.com/?q=${latitude},${longitude}`)}
        />
      ) : null}
    </Card>
  );
}

function DispatchHints({ breakdown }: { breakdown: BreakdownDetail }) {
  return (
    <Card title="Also open on this Job">
      {breakdown.dispatchHints.map((hint) => (
        <Pressable
          key={hint.breakdownId}
          accessibilityRole="button"
          className="flex-row items-center gap-2"
          onPress={() =>
            router.push({ pathname: '/contracting/workshop/[breakdownId]', params: { breakdownId: hint.breakdownId } })
          }
        >
          <CategoryIcon icon={hint.subject.categoryIcon} colour={hint.subject.categoryColour} size={16} />
          <Text className="min-w-0 flex-1 text-sm text-foreground" numberOfLines={1}>
            {hint.subject.code} · {breakdownUrgencyLabels[hint.urgency]} · {hint.firstLine}
          </Text>
        </Pressable>
      ))}
    </Card>
  );
}

function DescriptionCard({ breakdown }: { breakdown: BreakdownDetail }) {
  const patch = useBreakdownMutation((breakdowns) => breakdowns.patch);
  const [draft, setDraft] = useState<string | null>(null);
  const voice = useVoiceSession('breakdown description', {
    value: draft ?? '',
    onChangeText: setDraft,
    maxLength: BreakdownDescription.maxLength ?? undefined,
  });
  const { busy, error, run } = useBusyAction();
  const valid = draft !== null && BreakdownDescription.safeParse(draft).success;
  const save = () => {
    if (draft === null || !valid) return;
    void run(async () => {
      await patch.mutateAsync({ id: breakdown.id, description: draft });
      voice.reportSaved();
      setDraft(null);
    }, BREAKDOWN_SAVE_FAILED);
  };
  return (
    <Card title="Description">
      {draft === null ? (
        <>
          <Text className="text-foreground">{breakdown.description}</Text>
          <VerdictButton
            verdict={breakdown.actions.editReport}
            title="Edit"
            onPress={() => setDraft(breakdown.description)}
          />
        </>
      ) : (
        <>
          <VoiceTextArea accessibilityLabel="What's wrong" editable={!busy} rows={5} voice={voice} />
          {error ? <Text className="text-danger">{error}</Text> : null}
          <View className="flex-row gap-2">
            <View className="flex-1">
              <Button
                title="Cancel"
                disabled={busy}
                onPress={() => {
                  voice.reset();
                  setDraft(null);
                }}
              />
            </View>
            <View className="flex-1">
              <Button
                primary
                title={busy ? 'Saving…' : 'Save'}
                disabled={busy || voice.busy || !valid}
                onPress={save}
              />
            </View>
          </View>
        </>
      )}
    </Card>
  );
}
