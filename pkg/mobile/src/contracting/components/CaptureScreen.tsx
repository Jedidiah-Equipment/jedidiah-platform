import { formatHours } from '@pkg/domain';
import { captureNeedsComment, captureRefusals, isFutureReadAt } from '@pkg/domain/contracting';
import { ReadingComment, type ReadingErrorCode, type ReadingRole } from '@pkg/schema/contracting';
import { useQueryClient } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useRef, useState } from 'react';
import { View } from 'react-native';
import { FormPage } from '@/components/FormPage';
import { FieldLabel, FieldShell } from '@/components/form/fields/FieldShell';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { type MeterPhoto, MeterPhotoField } from '@/contracting/components/MeterPhotoField';
import { ReadAtField } from '@/contracting/components/ReadAtField';
import { type PlannedStint, StintOverrideCard, useStintOverrides } from '@/contracting/components/StintOverrideCard';
import { recordReadingCaptured } from '@/contracting/observability';
import { type AttemptIdentity, captureAttempt, captureAttemptPayload } from '@/contracting/readings/capture-attempt';
import { deriveCapture } from '@/contracting/readings/derive-capture';
import { capturedAtFor, isBackdated, type ReadAtChoice, readAtAfterPhoto } from '@/contracting/readings/read-at';
import { CAPTURE_FAILED, captureReading, ReadingRefusedError } from '@/contracting/readings/reading-upload';
import { useFleet, useMachineReadings } from '@/contracting/readings/use-fleet';
import { useVoiceSession } from '@/contracting/voice/use-voice-session';
import { VoiceTextArea } from '@/contracting/voice/VoiceTextArea';
import { useSessionPermission } from '@/lib/auth-session';
import { captureSanitizedException } from '@/lib/observability';
import { useTRPC } from '@/lib/trpc';
import { useBusyAction } from '@/lib/use-busy-action';

/** Refusals that mean the ledger moved under the form: its latest reading must be fetched again. */
const LEDGER_MOVED = new Set<string>(['reading.below_latest', 'reading.previous_changed'] satisfies ReadingErrorCode[]);

type CaptureTarget =
  | { kind: 'machine'; machineId: string }
  | {
      kind: 'stint';
      machineId: string;
      jobId: string;
      assignmentId: string;
      role: 'arrival' | 'departure';
      planned: PlannedStint;
    };

/** `/contracting/machines/[id]/capture`: a spot reading from the Machine screen. */
export default function MachineCaptureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  return <CaptureForm target={{ kind: 'machine', machineId: id }} />;
}

/** `/contracting/jobs/[jobId]/capture`: a stint's arrival or departure from the Job screen. */
export function JobCaptureScreen() {
  const params = useLocalSearchParams<{
    jobId: string;
    machineId: string;
    assignmentId: string;
    role?: string;
    overrideImplementId?: string;
    overrideDriverUserId?: string;
    implementCode?: string;
    driverName?: string;
  }>();
  return (
    <CaptureForm
      target={{
        kind: 'stint',
        machineId: params.machineId,
        jobId: params.jobId,
        assignmentId: params.assignmentId,
        role: params.role === 'departure' ? 'departure' : 'arrival',
        planned: {
          implementId: params.overrideImplementId || null,
          driverUserId: params.overrideDriverUserId || null,
          implementCode: params.implementCode || null,
          driverName: params.driverName || null,
        },
      }}
    />
  );
}

function CaptureForm({ target }: { target: CaptureTarget }) {
  const machineId = target.machineId;
  const role: Exclude<ReadingRole, 'baseline'> = target.kind === 'stint' ? target.role : 'spot';
  const assignmentId = target.kind === 'stint' ? target.assignmentId : null;
  const returnTo = (
    target.kind === 'stint' ? `/contracting/jobs/${target.jobId}` : `/contracting/machines/${machineId}`
  ) as Href;
  const leave = () => router.dismissTo(returnTo);
  const navigation = useNavigation();
  const fleet = useFleet();
  const machine = fleet.data?.find((row) => row.id === machineId);
  const readings = useMachineReadings(machineId);
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const canCapture = useSessionPermission('contracting_reading:capture');
  const management = useSessionPermission('contracting_job:work-any');
  const [cameraOpen, setCameraOpen] = useState(false);
  const [photo, setPhoto] = useState<MeterPhoto | null>(null);
  // Null is "now".
  const [readAt, setReadAt] = useState<ReadAtChoice | null>(null);
  const [value, setValue] = useState('');
  // Judged once typing stops, as web does: a half-typed value is not yet below the previous reading.
  const [valueFocused, setValueFocused] = useState(false);
  const [comment, setComment] = useState('');
  const voice = useVoiceSession('capture comment');
  const [disputedReadingId, setDisputedReadingId] = useState<string | null>(null);
  const overrides = useStintOverrides(target.kind === 'stint' ? target.planned : null);
  const action = useBusyAction();
  const { busy, error, setError, run } = action;
  const attempt = useRef<AttemptIdentity | null>(null);
  const latestRow = readings.data?.[0];
  const latest = latestRow ? { id: latestRow.id, value: latestRow.value } : null;
  const commentRequired = captureNeedsComment(role, { management, hasPhoto: photo !== null });
  const { parsed, below, disputeConfirmed, canSave } = deriveCapture({
    value,
    latest,
    disputedReadingId,
    comment,
    commentRequired,
    canCapture,
    machineKnown: !!machine,
    cameraOpen,
    futureReadAt: readAt !== null && isFutureReadAt(readAt.at),
  });
  function save() {
    if (!canSave || !parsed?.success) return;
    const reading = parsed.data;
    const stintOverrides = target.kind === 'stint' && target.role === 'arrival' ? overrides.value : undefined;
    // Name the latest only once history has loaded; the server then refuses a capture judged against an older one.
    const expectedPreviousId = readings.data ? (latest?.id ?? null) : undefined;
    // Only what the Foreman entered: a reconnect refetches history, and a retry after it must still replay.
    attempt.current = captureAttempt(
      attempt.current,
      captureAttemptPayload({
        role,
        assignmentId,
        value: reading,
        photo: photo?.uri ?? null,
        comment,
        disputedReadingId,
        stintOverrides: stintOverrides ?? null,
        readAt: readAt?.at ?? null,
      }),
    );
    const { localId, attemptedAt } = attempt.current;
    const capturedAt = capturedAtFor(readAt?.at ?? null, attemptedAt);
    const captured = {
      role,
      hasPhoto: photo !== null,
      photoSource: photo?.source ?? null,
      backdated: isBackdated(readAt?.at ?? null, attemptedAt),
    };
    return run(async () => {
      try {
        await captureReading(
          {
            localId,
            machineId,
            role,
            ...(assignmentId ? { assignmentId } : {}),
            ...(stintOverrides ? { stintOverrides } : {}),
            value: reading,
            capturedAt,
            comment: comment.trim() || null,
            disputePrevious: disputeConfirmed,
            ...(expectedPreviousId !== undefined ? { expectedPreviousId } : {}),
          },
          photo?.uri ?? null,
        );
      } catch (error) {
        if (error instanceof ReadingRefusedError) {
          recordReadingCaptured({ ...captured, refused: error.code });
          if (LEDGER_MOVED.has(error.code)) {
            setDisputedReadingId(null);
            void queryClient.invalidateQueries({
              queryKey: trpc.contractingReadings.fieldHistory.queryKey({ machineId }),
            });
          }
          setError(error.message);
          return;
        }
        captureSanitizedException(error, 'Reading capture failed', { source: 'reading_capture' });
        throw error;
      }
      recordReadingCaptured({ ...captured, refused: null });
      voice.reportSaved(comment.trim());
      // The screens underneath stay mounted, so they refetch in place: the form leaves without waiting on them.
      void queryClient.invalidateQueries({ queryKey: trpc.contractingReadings.pathKey() });
      void queryClient.invalidateQueries({ queryKey: trpc.contractingJobs.pathKey() });
      if (navigation.isFocused()) leave();
    }, CAPTURE_FAILED);
  }
  return (
    <FormPage
      toolbar={
        <SecondaryToolbar
          title={
            role === 'arrival' ? 'Capture arrival' : role === 'departure' ? 'Capture departure' : 'Capture reading'
          }
          subtitle={machine?.code ?? 'CONTRACTING'}
          parentLabel={target.kind === 'stint' ? 'Job' : 'Machine'}
          onBack={() => {
            if (!busy) leave();
          }}
          helpTopic="contractingMobileCapture"
        />
      }
      error={error}
      footer={
        <>
          {!canCapture ? <Text className="text-danger">Your role cannot capture readings.</Text> : null}
          {/* In the fixed footer, so the warning never pushes the form's fields while it comes and goes. */}
          {below && !valueFocused ? (
            <View className="gap-3 rounded-xl border border-danger p-4">
              <Text className="text-foreground">
                This is below the previous reading. Correct your value, retake the photo, or dispute the previous
                reading.
              </Text>
              <Button
                title={disputeConfirmed ? 'Previous reading disputed · undo' : 'The previous reading is wrong'}
                onPress={() => setDisputedReadingId(disputeConfirmed ? null : (latest?.id ?? null))}
                disabled={busy}
              />
            </View>
          ) : null}
          <Button
            primary={canSave && !busy}
            title={busy ? 'Saving…' : 'Save reading'}
            disabled={busy || !canSave}
            onPress={() => {
              void save();
            }}
          />
        </>
      }
    >
      <MeterPhotoField
        photo={photo}
        cameraOpen={cameraOpen}
        onCameraOpenChange={setCameraOpen}
        action={action}
        onChange={(next, takenAt) => {
          setPhoto(next);
          setReadAt((current) => readAtAfterPhoto(current, takenAt));
        }}
      />
      <FieldShell
        label={
          <View className="flex-row items-baseline justify-between gap-3">
            <FieldLabel>Current reading</FieldLabel>
            {latest ? (
              <Text className="text-xs text-muted-foreground">
                Previous reading:{' '}
                <Text className="text-xs text-primary" weight="semibold">
                  {formatHours(latest.value)}
                </Text>
              </Text>
            ) : null}
          </View>
        }
        errors={
          !valueFocused && value && !parsed?.success
            ? [{ message: 'Enter a non-negative value with at most one decimal place.' }]
            : []
        }
      >
        <TextInput
          accessibilityLabel="Current reading"
          keyboardType="decimal-pad"
          placeholder="e.g. 1234.5"
          value={value}
          editable={!busy}
          onFocus={() => setValueFocused(true)}
          onBlur={() => setValueFocused(false)}
          onChangeText={(text) => {
            setValue(text);
            setDisputedReadingId(null);
          }}
        />
      </FieldShell>
      <Divider label={photo === null ? 'photo or' : null} />
      <FieldShell label={commentLabel(role, commentRequired)}>
        {/* Sized by its rows, so swapping the placeholder when a photo is attached never moves the form. */}
        <VoiceTextArea
          accessibilityLabel={commentLabel(role, commentRequired)}
          placeholder={photo === null ? 'No photo? Say why…' : 'Anything management should know about this reading'}
          value={comment}
          editable={!busy}
          rows={COMMENT_ROWS}
          maxLength={ReadingComment.maxLength ?? undefined}
          onChangeText={setComment}
          voice={voice}
        />
      </FieldShell>
      {target.kind === 'stint' && target.role === 'arrival' ? (
        <StintOverrideCard planned={target.planned} overrides={overrides} />
      ) : null}
      <FieldShell
        label="Read At"
        errors={readAt && isFutureReadAt(readAt.at) ? [{ message: captureRefusals['future-read-at'].message }] : []}
      >
        <ReadAtField
          value={readAt?.at ?? null}
          disabled={busy}
          onChange={(next) => setReadAt(next ? { at: next, by: 'hand' } : null)}
        />
      </FieldShell>
    </FormPage>
  );
}

/** Web's wording: a departure asks for a reason, every other reading for a comment. */
function commentLabel(role: Exclude<ReadingRole, 'baseline'>, required: boolean) {
  if (role === 'departure') return required ? 'Reason' : 'Reason (optional)';
  return required ? 'Comment' : 'Comment (optional)';
}

const COMMENT_ROWS = 3;

/** Points, not rem: the rule keeps one height with or without its word, so nothing below it moves. */
const DIVIDER_HEIGHT = 20;

/** A rule across the form, with a short word in its middle when there is one. */
function Divider({ label }: { label: string | null }) {
  return (
    <View className="flex-row items-center gap-3" style={{ height: DIVIDER_HEIGHT }}>
      <View className="h-px flex-1 bg-border" />
      {label ? (
        <>
          <Text className="text-xs text-muted-foreground">{label}</Text>
          <View className="h-px flex-1 bg-border" />
        </>
      ) : null}
    </View>
  );
}
