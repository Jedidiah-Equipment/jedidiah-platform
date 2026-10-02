import { formatHours } from '@pkg/domain';
import { captureNeedsComment, captureRefusals, isFutureReadAt } from '@pkg/domain/contracting';
import { ReadingComment, type ReadingErrorCode, type ReadingRole } from '@pkg/schema/contracting';
import { useQueryClient } from '@tanstack/react-query';
import { type Href, router, useLocalSearchParams, useNavigation } from 'expo-router';
import { useRef, useState } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { SECONDARY_PAGE_CONTENT_STYLE } from '@/components/page-frame';
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
import { useSessionPermission } from '@/lib/auth-session';
import { captureSanitizedException } from '@/lib/observability';
import { useTRPC } from '@/lib/trpc';
import { useBusyAction } from '@/lib/use-busy-action';

/** Refusals that mean the ledger moved under the form: its latest reading must be fetched again. */
const LEDGER_MOVED = new Set<string>(['reading.below_latest', 'reading.previous_changed'] satisfies ReadingErrorCode[]);
const REFRESH_WAIT_MS = 5_000;

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
  const { bottom: safeAreaBottom } = useSafeAreaInsets();
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
  const [comment, setComment] = useState('');
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
      // The screens underneath stay mounted, so this refetches what they show before they are shown again.
      const refreshed = Promise.all([
        queryClient.invalidateQueries({ queryKey: trpc.contractingReadings.pathKey() }),
        queryClient.invalidateQueries({ queryKey: trpc.contractingJobs.field.pathKey() }),
      ]);
      await Promise.race([refreshed, new Promise((resolve) => setTimeout(resolve, REFRESH_WAIT_MS))]);
      // A swipe back during the wait may already have opened another capture; leaving now would close it.
      if (navigation.isFocused()) leave();
    }, CAPTURE_FAILED);
  }
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title={role === 'arrival' ? 'Capture arrival' : role === 'departure' ? 'Capture departure' : 'Capture reading'}
        subtitle={machine?.code ?? 'CONTRACTING'}
        parentLabel={target.kind === 'stint' ? 'Job' : 'Machine'}
        onBack={() => {
          if (!busy) leave();
        }}
        helpTopic="contractingMobileCapture"
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ ...SECONDARY_PAGE_CONTENT_STYLE, gap: 16 }}
        >
          <Text className="text-muted-foreground">Photograph the hour meter when you can, then type its value.</Text>
          {target.kind === 'stint' && target.role === 'arrival' ? (
            <StintOverrideCard planned={target.planned} overrides={overrides} />
          ) : null}
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
          <View className="flex-row items-baseline justify-between">
            <Text className="text-foreground" weight="semibold">
              Hour meter value
            </Text>
            {latest ? (
              <Text className="text-sm text-muted-foreground">Minimum allowed: {formatHours(latest.value)}</Text>
            ) : null}
          </View>
          <TextInput
            accessibilityLabel="Hour meter value"
            keyboardType="decimal-pad"
            placeholder="e.g. 1234.5"
            value={value}
            editable={!busy}
            onChangeText={(text) => {
              setValue(text);
              setDisputedReadingId(null);
            }}
          />
          {value && !parsed?.success ? (
            <Text className="text-danger">Enter a non-negative value with at most one decimal place.</Text>
          ) : null}
          <Text className="text-foreground" weight="semibold">
            Read At
          </Text>
          <ReadAtField
            value={readAt?.at ?? null}
            disabled={busy}
            onChange={(next) => setReadAt(next ? { at: next, by: 'hand' } : null)}
          />
          {readAt && isFutureReadAt(readAt.at) ? (
            <Text className="text-danger">{captureRefusals['future-read-at'].message}</Text>
          ) : null}
          <Text className="text-foreground" weight="semibold">
            {commentRequired ? 'Comment (required without photo)' : 'Comment (optional)'}
          </Text>
          <TextInput
            accessibilityLabel="Capture comment"
            placeholder="Anything management should know about this reading"
            value={comment}
            editable={!busy}
            multiline
            maxLength={ReadingComment.maxLength ?? undefined}
            onChangeText={setComment}
          />
          {below ? (
            <View className="gap-3 rounded-xl border border-danger p-4">
              <Text className="text-foreground">
                This is below the minimum allowed. Correct your value, retake the photo, or dispute the previous
                reading.
              </Text>
              <Button
                title={disputeConfirmed ? 'Previous reading disputed · undo' : 'The previous reading is wrong'}
                onPress={() => setDisputedReadingId(disputeConfirmed ? null : (latest?.id ?? null))}
                disabled={busy}
              />
            </View>
          ) : null}
        </ScrollView>
        <View
          className="gap-2 border-t border-border bg-background px-4 pt-3"
          style={{ paddingBottom: Math.max(safeAreaBottom, 16) }}
        >
          {error ? (
            <Text className="text-danger" accessibilityRole="alert">
              {error}
            </Text>
          ) : null}
          {!canCapture ? <Text className="text-danger">Your role cannot capture readings.</Text> : null}
          <Button
            primary
            title={busy ? 'Saving…' : 'Save reading'}
            disabled={busy || !canSave}
            onPress={() => {
              void save();
            }}
          />
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}
