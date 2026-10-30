import { getFirstName } from '@pkg/domain';
import {
  breakdownSubjectKindLabels,
  breakdownUrgencyLabels,
  fieldReaderOpensJob,
  presentAction,
} from '@pkg/domain/contracting';
import { BreakdownDescription, type BreakdownDetail } from '@pkg/schema/contracting';
import { IconMapPin, IconPencil } from '@tabler/icons-react-native';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Linking, Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { DateText } from '@/components/DateText';
import { SECONDARY_PAGE_CONTENT_STYLE } from '@/components/page-frame';
import { ScrollLockScrollView } from '@/components/scroll-lock';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Card, CardIconAction } from '@/components/ui/card';
import { DialogCard } from '@/components/ui/dialog-card';
import { Text } from '@/components/ui/text';
import { ThemedModal } from '@/components/ui/themed-modal';
import { useAppToast } from '@/components/ui/toast';
import { useVoiceSession } from '@/components/voice/use-voice-session';
import { VoiceTextArea } from '@/components/voice/VoiceTextArea';
import { AddNoteButton } from '@/contracting/activity/AddNoteButton';
import { ContractingActivityFeed } from '@/contracting/activity/ContractingActivityFeed';
import { RecordTabBar, useRecordTab } from '@/contracting/activity/RecordTabs';
import { BreakdownStatusBadge, BreakdownSubjectIcons } from '@/contracting/components/BreakdownSubjectIcons';
import { useSessionAccessSummary } from '@/lib/auth-session';
import { useBusyAction } from '@/lib/use-busy-action';
import { BreakdownPhotosCard } from './BreakdownPhotosCard';
import { BreakdownWorkshopCard } from './BreakdownWorkshopCard';
import { BREAKDOWN_SAVE_FAILED, useBreakdown, useBreakdownMutation } from './use-breakdowns';

export default function BreakdownScreen() {
  const { breakdownId } = useLocalSearchParams<{ breakdownId: string }>();
  const query = useBreakdown(breakdownId);
  const breakdown = query.data;
  const [tab, setTab] = useRecordTab();
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title="Breakdown"
        subtitle={breakdown?.subject.code ?? 'CONTRACTING'}
        parentLabel="Workshop"
        onBack={() => router.navigate('/contracting/workshop' as Href)}
        helpTopic="contractingMobileBreakdown"
      />
      {breakdown ? <RecordTabBar value={tab} onChange={setTab} /> : null}
      {breakdown && tab === 'activity' ? (
        <ContractingActivityFeed
          thread={{ kind: 'breakdown', id: breakdown.id }}
          listHeader={
            <AddNoteButton
              thread={{ kind: 'breakdown', id: breakdown.id, code: breakdown.subject.code }}
              verdict={breakdown.actions.addNote}
            />
          }
          showControls={false}
        />
      ) : (
        <ScrollLockScrollView
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
        </ScrollLockScrollView>
      )}
    </SafeAreaView>
  );
}

function BreakdownSections({ breakdown }: { breakdown: BreakdownDetail }) {
  return (
    <>
      <HeaderCard breakdown={breakdown} />
      <BreakdownWorkshopCard breakdown={breakdown} />
      <DescriptionCard breakdown={breakdown} />
      <BreakdownPhotosCard breakdown={breakdown} />
      {breakdown.dispatchHints.length ? <DispatchHints breakdown={breakdown} /> : null}
      <LocationCard breakdown={breakdown} />
    </>
  );
}

function HeaderCard({ breakdown }: { breakdown: BreakdownDetail }) {
  // A Foreman opens only Jobs he is Foreman of; this Breakdown may be his report on someone else's.
  const canOpenJob = fieldReaderOpensJob(useSessionAccessSummary(), { foremanUserId: breakdown.jobForemanUserId });
  const [changingUrgency, setChangingUrgency] = useState(false);
  // The same gate as the description's pencil: urgency is part of the report.
  const canChangeUrgency = presentAction(breakdown.actions.editReport)?.disabled === false;
  const { subject } = breakdown;
  return (
    <Card>
      <View className="flex-row items-center gap-3">
        <BreakdownSubjectIcons
          urgency={breakdown.urgency}
          subject={subject}
          size={24}
          onPressUrgency={canChangeUrgency ? () => setChangingUrgency(true) : undefined}
        />
        <View className="min-w-0 flex-1">
          <Text className="text-lg text-foreground" weight="bold">
            {subject.code}
          </Text>
          <Text className="text-sm text-muted-foreground">
            {breakdownSubjectKindLabels[subject.kind]} · {subject.categoryName}
          </Text>
        </View>
        <View className="self-start">
          <BreakdownStatusBadge status={breakdown.status} />
        </View>
      </View>
      {breakdown.jobId && breakdown.jobNumber ? (
        <Pressable
          accessibilityRole={canOpenJob ? 'link' : undefined}
          disabled={!canOpenJob}
          onPress={() => router.navigate(`/contracting/jobs/${breakdown.jobId}` as Href)}
        >
          <Text className="text-foreground" weight="semibold">
            {breakdown.jobNumber}
            {breakdown.farmName ? ` · ${breakdown.farmName}` : ''}
          </Text>
        </Pressable>
      ) : (
        <Text className="text-muted-foreground">Not on a Job</Text>
      )}
      <Text className="text-sm text-muted-foreground">
        Reported <DateText className="text-sm text-muted-foreground" date={breakdown.reportedAt} format="medium" /> by{' '}
        {getFirstName(breakdown.reporterName)}
      </Text>
      <UrgencyModal breakdown={breakdown} open={changingUrgency} onClose={() => setChangingUrgency(false)} />
    </Card>
  );
}

/** Offers the one other urgency and saves it the moment it is chosen. */
function UrgencyModal({
  breakdown,
  open,
  onClose,
}: {
  breakdown: BreakdownDetail;
  open: boolean;
  onClose: () => void;
}) {
  const patch = useBreakdownMutation((breakdowns) => breakdowns.patch);
  const showToast = useAppToast();
  const { busy, error, setError, run } = useBusyAction();
  const next = breakdown.urgency === 'code-red' ? 'code-green' : 'code-red';
  const close = () => {
    setError(null);
    onClose();
  };
  return (
    <ThemedModal backdropLabel="Keep the urgency" open={open} onClose={close} dismissDisabled={busy}>
      <DialogCard
        title="Change urgency"
        error={error}
        actions={
          <>
            <Button
              primary={!busy}
              title={busy ? 'Saving…' : `Change to ${breakdownUrgencyLabels[next]}`}
              disabled={busy}
              onPress={() =>
                void run(async () => {
                  await patch.mutateAsync({ id: breakdown.id, urgency: next });
                  showToast('success', `Now ${breakdownUrgencyLabels[next]}`);
                  close();
                }, BREAKDOWN_SAVE_FAILED)
              }
            />
            <Button title="Cancel" disabled={busy} onPress={close} />
          </>
        }
      />
    </ThemedModal>
  );
}

/** Where the phone was when the Breakdown was reported; absent when no position was attached. */
function LocationCard({ breakdown }: { breakdown: BreakdownDetail }) {
  const { latitude, longitude } = breakdown;
  if (latitude === null || longitude === null) return null;
  return (
    <Card title="Location">
      <Button
        title="Open in Maps"
        icon={IconMapPin}
        onPress={() => void Linking.openURL(`https://maps.google.com/?q=${latitude},${longitude}`)}
      />
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
          <BreakdownSubjectIcons urgency={hint.urgency} subject={hint.subject} size={16} />
          <Text className="min-w-0 flex-1 text-sm text-foreground" numberOfLines={1}>
            {hint.subject.code} · {hint.firstLine}
          </Text>
          <BreakdownStatusBadge status={hint.status} />
        </Pressable>
      ))}
    </Card>
  );
}

function DescriptionCard({ breakdown }: { breakdown: BreakdownDetail }) {
  const patch = useBreakdownMutation((breakdowns) => breakdowns.patch);
  const [draft, setDraft] = useState<string | null>(null);
  const voice = useVoiceSession({ business: 'contracting', purpose: 'breakdown description' });
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
  // Only an edit the reporter may make now earns the pencil; a refused one shows nothing, to keep the card short.
  const canEdit = presentAction(breakdown.actions.editReport)?.disabled === false;
  return (
    <Card
      title="Description"
      action={
        canEdit && draft === null ? (
          <CardIconAction icon={IconPencil} label="Edit description" onPress={() => setDraft(breakdown.description)} />
        ) : null
      }
    >
      {draft === null ? (
        <Text className="text-foreground">{breakdown.description}</Text>
      ) : (
        <>
          <VoiceTextArea
            accessibilityLabel="What's wrong"
            editable={!busy}
            rows={5}
            value={draft ?? ''}
            onChangeText={setDraft}
            maxLength={BreakdownDescription.maxLength ?? undefined}
            voice={voice}
          />
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
