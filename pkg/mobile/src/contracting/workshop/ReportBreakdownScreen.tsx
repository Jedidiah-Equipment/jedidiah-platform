import { formatCoordinates, formatDate } from '@pkg/domain';
import {
  breakdownSubjectKindLabels,
  breakdownUrgencyColorClassNames,
  breakdownUrgencyLabels,
} from '@pkg/domain/contracting';
import {
  BREAKDOWN_MAX_PHOTOS,
  BreakdownDescription,
  type BreakdownSubjectKind,
  type BreakdownSubjectRef,
  type BreakdownUrgency,
  breakdownSubjectKinds,
} from '@pkg/schema/contracting';
import { type Href, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { type ReactNode, useEffect, useMemo, useRef, useState } from 'react';
import { Pressable, View } from 'react-native';
import { FormPage } from '@/components/FormPage';
import { FieldShell } from '@/components/form/fields/FieldShell';
import { SearchSelect } from '@/components/form/fields/SearchSelectField';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import type { StatusBadgeClassNames } from '@/components/ui/status-badge';
import { Text } from '@/components/ui/text';
import { BreakdownStatusBadge, BreakdownUrgencyIcon } from '@/contracting/components/BreakdownSubjectIcons';
import { CategoryIcon } from '@/contracting/components/CategoryIcon';
import { implementOption } from '@/contracting/components/implement-option';
import { PhotoStrip } from '@/contracting/components/PhotoStrip';
import { useImplements } from '@/contracting/jobs/use-jobs';
import { newLocalId } from '@/contracting/lib/local-id';
import { recordBreakdownReported } from '@/contracting/observability';
import { useFleet } from '@/contracting/readings/use-fleet';
import { useVoiceSession } from '@/contracting/voice/use-voice-session';
import { VoiceTextArea } from '@/contracting/voice/VoiceTextArea';
import { useSessionPermission } from '@/lib/auth-session';
import { choosePhotos, type PickedPhoto, takePhoto } from '@/lib/photo-picker';
import { useBusyAction } from '@/lib/use-busy-action';
import { useColorMode } from '@/theme/use-color-mode';
import { deriveReport } from './breakdown-form';
import { type BreakdownReportRequest, REPORT_FAILED, reportBreakdown } from './breakdown-upload';
import { currentPosition } from './location';
import { useBreakdownUpload, useOpenOnSubject } from './use-breakdowns';

type Photo = PickedPhoto & { id: string };
const PICK_FAILED = 'The photo could not be added. Try again.';
const URGENCY_CHOICES: { urgency: BreakdownUrgency; label: string }[] = [
  { urgency: 'code-red', label: `${breakdownUrgencyLabels['code-red']} — machine down` },
  { urgency: 'code-green', label: `${breakdownUrgencyLabels['code-green']} — still working` },
];

const isSubjectKind = (value: unknown): value is BreakdownSubjectKind =>
  (breakdownSubjectKinds as readonly unknown[]).includes(value);

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
  const canReport = useSessionPermission('contracting_breakdown:report');
  const fleet = useFleet();
  const implementsQuery = useImplements();
  const report = useBreakdownUpload((request: { input: BreakdownReportRequest; photoUris: string[] }) =>
    reportBreakdown(request.input, request.photoUris),
  );
  const [kind, setKind] = useState<BreakdownSubjectKind>(prefilled?.kind ?? 'machine');
  const [pickedId, setPickedId] = useState(prefilled?.id ?? '');
  const subject: BreakdownSubjectRef | null = prefilled ?? (pickedId ? { kind, id: pickedId } : null);
  const [urgency, setUrgency] = useState<BreakdownUrgency | null>(null);
  const [description, setDescription] = useState('');
  const voice = useVoiceSession('breakdown description', {
    value: description,
    onChangeText: setDescription,
    maxLength: BreakdownDescription.maxLength ?? undefined,
  });
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [galleryHint, setGalleryHint] = useState(false);
  const [position, setPosition] = useState<{ latitude: number; longitude: number } | null>(null);
  const { busy, error, setError, run } = useBusyAction();
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
  const { canSend, photosLeft, messages } = deriveReport(
    { subject, urgency, description, photoCount: photos.length },
    { canReport, busy: busy || voice.busy },
  );
  const leave = () => router.navigate(returnTo);

  async function addPhotos(pick: () => Promise<PickedPhoto[]>) {
    try {
      const picked = await pick();
      setPhotos((current) =>
        [...current, ...picked.map((photo) => ({ ...photo, id: newLocalId() }))].slice(0, BREAKDOWN_MAX_PHOTOS),
      );
      if (picked.some((photo) => !photo.inGallery)) setGalleryHint(true);
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
      const reported = await report.mutateAsync({ input, photoUris: photos.map((photo) => photo.uri) });
      voice.reportSaved();
      recordBreakdownReported({
        urgency,
        subjectKind: subject.kind,
        photoCount: photos.length,
        hasGps: position !== null,
        hasJob: reported.jobId !== null,
      });
      if (navigation.isFocused()) leave();
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
          {canReport && !busy && !canSend ? (
            <Text className="text-sm text-muted-foreground">{Object.values(messages)[0]}</Text>
          ) : null}
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
        <Card>
          <View className="flex-row items-center gap-3">
            {subjectRow ? (
              <CategoryIcon icon={subjectRow.categoryIcon} colour={subjectRow.categoryColour} size={24} />
            ) : null}
            <View className="min-w-0 flex-1">
              <Text className="text-lg text-foreground" weight="bold">
                {subjectRow?.code ?? breakdownSubjectKindLabels[prefilled.kind]}
              </Text>
              {subjectRow ? <Text className="text-sm text-muted-foreground">{subjectRow.categoryName}</Text> : null}
            </View>
          </View>
        </Card>
      ) : (
        <FieldShell label="What has the problem?">
          <View className="flex-row gap-2">
            {breakdownSubjectKinds.map((option) => (
              <Toggle
                key={option}
                label={breakdownSubjectKindLabels[option]}
                selected={kind === option}
                disabled={busy}
                onPress={() => {
                  if (option === kind) return;
                  setKind(option);
                  setPickedId('');
                }}
              />
            ))}
          </View>
          <SearchSelect
            label={breakdownSubjectKindLabels[kind]}
            placeholder={`Choose the ${breakdownSubjectKindLabels[kind]}`}
            searchPlaceholder="Search by code or category…"
            emptyMessage="Nothing matches."
            disabled={busy}
            value={pickedId}
            onChange={setPickedId}
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
              <View className="flex-row items-center gap-2">
                <BreakdownUrgencyIcon urgency={row.urgency} size={16} />
                <Text className="min-w-0 flex-1 text-sm text-foreground" numberOfLines={2}>
                  {row.firstLine} ({formatDate(row.reportedAt, 'duration')})
                </Text>
                <BreakdownStatusBadge status={row.status} />
              </View>
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
              leading={<BreakdownUrgencyIcon urgency={choice.urgency} size={16} />}
              selected={urgency === choice.urgency}
              selectedClassNames={breakdownUrgencyColorClassNames[choice.urgency]}
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
          editable={!busy}
          rows={5}
          voice={voice}
        />
      </FieldShell>
      <PhotoStrip
        noun="Breakdown photo"
        photos={photos}
        limit={BREAKDOWN_MAX_PHOTOS}
        busy={busy}
        galleryHint={galleryHint}
        onTake={() => void addPhotos(takePhoto)}
        onChoose={() => void addPhotos(() => choosePhotos(photosLeft))}
        onRemove={(photoId) => setPhotos((current) => current.filter((photo) => photo.id !== photoId))}
      />
      {position ? (
        <Text className="text-sm text-muted-foreground">Location attached: {formatCoordinates(position)}</Text>
      ) : null}
    </FormPage>
  );
}

/** A choice button: primary when picked, or the choice's own domain palette when it has one. */
function Toggle({
  label,
  leading,
  selected,
  selectedClassNames,
  disabled,
  onPress,
}: {
  label: string;
  leading?: ReactNode;
  selected: boolean;
  selectedClassNames?: StatusBadgeClassNames;
  disabled: boolean;
  onPress: () => void;
}) {
  const { resolved } = useColorMode();
  const selectedClass = selectedClassNames ? selectedClassNames.chip : 'border-primary bg-primary';
  const selectedText = selectedClassNames ? selectedClassNames.textByScheme[resolved] : 'text-primary-foreground';
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected, disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`min-h-12 flex-1 flex-row items-center justify-center gap-2 rounded-xl border px-4 py-3 ${selected ? selectedClass : 'border-border bg-surface'}`}
    >
      {leading}
      <Text className={`text-center ${selected ? selectedText : 'text-foreground'}`} weight="semibold">
        {label}
      </Text>
    </Pressable>
  );
}
