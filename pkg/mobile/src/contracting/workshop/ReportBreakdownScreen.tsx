import { formatDate } from '@pkg/domain';
import { breakdownUrgencyLabels } from '@pkg/domain/contracting';
import {
  BREAKDOWN_MAX_PHOTOS,
  BreakdownDescription,
  type BreakdownSubjectKind,
  type BreakdownSubjectRef,
  type BreakdownUrgency,
} from '@pkg/schema/contracting';
import { useStore } from '@tanstack/react-form';
import { useQueryClient } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { FormPage } from '@/components/FormPage';
import { useAppForm } from '@/components/form';
import { FieldShell } from '@/components/form/fields/FieldShell';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { CategoryIcon } from '@/contracting/components/CategoryIcon';
import { implementOption } from '@/contracting/components/implement-option';
import { FieldNotePhotoStrip } from '@/contracting/field-notes/FieldNotePhotoStrip';
import { saveToGallery } from '@/contracting/field-notes/files';
import { choosePhotos, takePhoto } from '@/contracting/field-notes/pick-photos';
import { useImplements } from '@/contracting/jobs/use-jobs';
import { newLocalId } from '@/contracting/lib/local-id';
import { recordBreakdownReported } from '@/contracting/observability';
import { useFleet } from '@/contracting/readings/use-fleet';
import { useVoiceSession } from '@/contracting/voice/use-voice-session';
import { VoiceTextArea } from '@/contracting/voice/VoiceTextArea';
import { useSessionPermission } from '@/lib/auth-session';
import { captureSanitizedException } from '@/lib/observability';
import type { PhotoSource } from '@/lib/photo-picker';
import { useTRPC } from '@/lib/trpc';
import { useBusyAction } from '@/lib/use-busy-action';
import { deriveReport } from './breakdown-form';
import { BreakdownRefusedError, REPORT_FAILED, reportBreakdown } from './breakdown-upload';
import { currentPosition } from './location';
import { useOpenOnSubject } from './use-breakdowns';

type Photo = { id: string; uri: string; source: PhotoSource };
const PICK_FAILED = 'The photo could not be added. Try again.';
const URGENCY_CHOICES: { urgency: BreakdownUrgency; label: string }[] = [
  { urgency: 'code-red', label: 'Code Red — machine down' },
  { urgency: 'code-green', label: 'Code Green — still working' },
];

const isSubjectKind = (value: unknown): value is BreakdownSubjectKind => value === 'machine' || value === 'implement';

/** `/contracting/workshop/report`: from the Workshop tab, a Machine, or a stint on a Job. */
export default function ReportBreakdownScreen() {
  const params = useLocalSearchParams<{ subjectKind?: string; subjectId?: string; jobId?: string }>();
  const prefilled: BreakdownSubjectRef | null =
    isSubjectKind(params.subjectKind) && params.subjectId ? { kind: params.subjectKind, id: params.subjectId } : null;
  const jobId = params.jobId || null;
  const returnTo = (
    jobId
      ? `/contracting/jobs/${jobId}`
      : prefilled?.kind === 'machine'
        ? `/contracting/machines/${prefilled.id}`
        : '/contracting/workshop'
  ) as Href;
  const parentLabel = jobId ? 'Job' : prefilled?.kind === 'machine' ? 'Machine' : 'Workshop';
  const navigation = useNavigation();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const canReport = useSessionPermission('contracting_breakdown:report');
  const fleet = useFleet();
  const implementsQuery = useImplements();
  const [kind, setKind] = useState<BreakdownSubjectKind>(prefilled?.kind ?? 'machine');
  const picker = useAppForm({ defaultValues: { subjectId: prefilled?.id ?? '' } });
  const pickedId = useStore(picker.store, (state) => state.values.subjectId);
  const subject: BreakdownSubjectRef | null = prefilled ?? (pickedId ? { kind, id: pickedId } : null);
  const [urgency, setUrgency] = useState<BreakdownUrgency | null>(null);
  const [description, setDescription] = useState('');
  const voice = useVoiceSession('breakdown description');
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [galleryHint, setGalleryHint] = useState(false);
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const action = useBusyAction();
  const { busy, error, setError, run } = action;
  const existing = useOpenOnSubject(subject);
  // One identifier per subject, so a retry after a lost answer replays rather than reporting twice.
  const localId = useRef(newLocalId());
  const subjectKey = subject ? `${subject.kind}:${subject.id}` : '';
  // biome-ignore lint/correctness/useExhaustiveDependencies: a new subject is a new report.
  useEffect(() => {
    localId.current = newLocalId();
  }, [subjectKey]);
  useEffect(() => {
    let active = true;
    void currentPosition().then((next) => {
      if (active) setPosition(next);
    });
    return () => {
      active = false;
    };
  }, []);

  const subjectRow = useMemo(() => {
    if (!subject) return null;
    if (subject.kind === 'machine') {
      const machine = fleet.data?.find((row) => row.id === subject.id);
      return machine ?? null;
    }
    return implementsQuery.data?.find((row) => row.id === subject.id) ?? null;
  }, [subject, fleet.data, implementsQuery.data]);
  const { canSend, photosLeft } = deriveReport(
    { subject, urgency, description, photoCount: photos.length },
    { canReport, busy: busy || voice.busy },
  );
  const leave = () => router.navigate(returnTo);

  async function addPhotos(pick: () => Promise<{ uri: string; source: PhotoSource }[]>) {
    try {
      const picked = await pick();
      setPhotos((current) =>
        [...current, ...picked.map((photo) => ({ ...photo, id: newLocalId() }))].slice(0, BREAKDOWN_MAX_PHOTOS),
      );
      for (const photo of picked.filter((candidate) => candidate.source === 'camera'))
        void saveToGallery(photo.uri).catch(() => setGalleryHint(true));
    } catch (pickError) {
      setError(pickError instanceof Error ? pickError.message : PICK_FAILED);
    }
  }

  function send() {
    if (!canSend || !subject || !urgency) return;
    const input = {
      localId: localId.current,
      subject,
      ...(jobId ? { jobId } : {}),
      urgency,
      description,
      latitude: position?.latitude ?? null,
      longitude: position?.longitude ?? null,
    };
    return run(async () => {
      let reported: Awaited<ReturnType<typeof reportBreakdown>>;
      try {
        reported = await reportBreakdown(
          input,
          photos.map((photo) => photo.uri),
        );
      } catch (sendError) {
        if (sendError instanceof BreakdownRefusedError) {
          setError(sendError.message);
          return;
        }
        captureSanitizedException(sendError, 'Breakdown report failed', { source: 'breakdown_report' });
        throw sendError;
      }
      voice.reportSaved(description.trim());
      recordBreakdownReported({
        urgency,
        subjectKind: subject.kind,
        photoCount: photos.length,
        hasGps: position !== null,
        hasJob: reported.jobId !== null,
      });
      void queryClient.invalidateQueries({ queryKey: trpc.contractingBreakdowns.pathKey() });
      if (navigation.isFocused())
        router.replace({ pathname: '/contracting/workshop/[breakdownId]', params: { breakdownId: reported.id } });
    }, REPORT_FAILED);
  }

  return (
    <FormPage
      toolbar={
        <SecondaryToolbar
          title="Report a problem"
          subtitle={subjectRow?.code ?? 'CONTRACTING'}
          parentLabel={parentLabel}
          onBack={() => {
            if (!busy) leave();
          }}
          helpTopic="contractingMobileReportBreakdown"
        />
      }
      error={error}
      footer={
        <>
          {!canReport ? <Text className="text-danger">Your role cannot report Breakdowns.</Text> : null}
          <Button
            primary={canSend}
            title={busy ? 'Sending…' : 'Send report'}
            disabled={!canSend}
            onPress={() => {
              void send();
            }}
          />
        </>
      }
    >
      {prefilled ? (
        <View className="flex-row items-center gap-3 rounded-xl border border-border bg-surface p-4">
          {subjectRow ? (
            <CategoryIcon icon={subjectRow.categoryIcon} colour={subjectRow.categoryColour} size={24} />
          ) : null}
          <View className="min-w-0 flex-1">
            <Text className="text-lg text-foreground" weight="bold">
              {subjectRow?.code ?? (prefilled.kind === 'machine' ? 'Machine' : 'Implement')}
            </Text>
            {subjectRow ? <Text className="text-sm text-muted-foreground">{subjectRow.categoryName}</Text> : null}
          </View>
        </View>
      ) : (
        <FieldShell label="What has the problem?">
          <View className="flex-row gap-2">
            {(['machine', 'implement'] as const).map((option) => (
              <Toggle
                key={option}
                label={option === 'machine' ? 'Machine' : 'Implement'}
                selected={kind === option}
                disabled={busy}
                onPress={() => {
                  if (option === kind) return;
                  setKind(option);
                  picker.setFieldValue('subjectId', '');
                }}
              />
            ))}
          </View>
          <picker.AppField name="subjectId">
            {(field) => (
              <field.SearchSelectField
                label={kind === 'machine' ? 'Machine' : 'Implement'}
                placeholder={kind === 'machine' ? 'Choose a Machine' : 'Choose an Implement'}
                searchPlaceholder="Search by code or category…"
                emptyMessage="Nothing matches."
                disabled={busy}
                options={
                  kind === 'machine'
                    ? (fleet.data ?? []).map((machine) => ({
                        value: machine.id,
                        label: machine.code,
                        description: machine.onSiteJobNumber
                          ? `${machine.categoryName} · On Job ${machine.onSiteJobNumber}`
                          : machine.categoryName,
                        icon: <CategoryIcon icon={machine.categoryIcon} colour={machine.categoryColour} size={16} />,
                      }))
                    : (implementsQuery.data ?? []).map(implementOption)
                }
              />
            )}
          </picker.AppField>
        </FieldShell>
      )}
      {subject ? (
        <Text className="text-sm text-muted-foreground">
          {jobId
            ? 'Reported on this Job.'
            : subjectRow?.onSiteJobNumber
              ? `Attaches to ${subjectRow.onSiteJobNumber}, where it is on site.`
              : 'Not on site on a Job.'}
        </Text>
      ) : null}
      {existing.data?.length ? (
        <FieldShell label="Already reported">
          {existing.data.map((row) => (
            <Pressable
              key={row.id}
              accessibilityRole="button"
              className="rounded-xl border border-border bg-surface p-3"
              onPress={() =>
                router.push({ pathname: '/contracting/workshop/[breakdownId]', params: { breakdownId: row.id } })
              }
            >
              <Text className="text-sm text-foreground" numberOfLines={2}>
                {breakdownUrgencyLabels[row.urgency]} · {row.firstLine} ({formatDate(row.reportedAt, 'duration')})
              </Text>
            </Pressable>
          ))}
        </FieldShell>
      ) : null}
      <FieldShell label="How bad is it?">
        <View className="gap-2">
          {URGENCY_CHOICES.map((choice) => (
            <Toggle
              key={choice.urgency}
              label={choice.label}
              selected={urgency === choice.urgency}
              tone={choice.urgency === 'code-red' ? 'danger' : 'default'}
              disabled={busy}
              onPress={() => setUrgency(choice.urgency)}
            />
          ))}
        </View>
      </FieldShell>
      <FieldShell label="What's wrong">
        <VoiceTextArea
          accessibilityLabel="What's wrong"
          placeholder="Describe the problem in your own words"
          value={description}
          editable={!busy}
          rows={5}
          maxLength={BreakdownDescription.maxLength ?? undefined}
          onChangeText={setDescription}
          voice={voice}
        />
      </FieldShell>
      <FieldNotePhotoStrip
        noun="Breakdown photo"
        photos={photos}
        limit={BREAKDOWN_MAX_PHOTOS}
        busy={busy}
        galleryHint={galleryHint}
        onTake={() => void addPhotos(takePhoto)}
        onChoose={() => void addPhotos(() => choosePhotos(photosLeft))}
        onRemove={(photoId) => setPhotos((current) => current.filter((photo) => photo.id !== photoId))}
      />
      {position ? <Text className="text-sm text-muted-foreground">Location attached</Text> : null}
    </FormPage>
  );
}

function Toggle({
  label,
  selected,
  disabled,
  tone = 'default',
  onPress,
}: {
  label: string;
  selected: boolean;
  disabled: boolean;
  tone?: 'default' | 'danger';
  onPress: () => void;
}) {
  const selectedClass = tone === 'danger' ? 'border-danger bg-danger' : 'border-primary bg-primary';
  const selectedText = tone === 'danger' ? 'text-danger-foreground' : 'text-primary-foreground';
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-12 flex-1 items-center justify-center rounded-xl border px-4 py-3 ${selected ? selectedClass : 'border-border bg-surface'}`}
    >
      <Text className={`text-center ${selected ? selectedText : 'text-foreground'}`} weight="semibold">
        {label}
      </Text>
    </Pressable>
  );
}
