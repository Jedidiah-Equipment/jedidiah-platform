import { formatHours } from '@pkg/domain';
import { FUTURE_READ_AT_REFUSAL, fieldJobAccessMode } from '@pkg/domain/contracting';
import { ReadingComment, type ReadingErrorCode, type ReadingRole } from '@pkg/schema/contracting';
import { useStore } from '@tanstack/react-form';
import { useQueryClient } from '@tanstack/react-query';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { type Href, router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useAppForm } from '@/components/form';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { implementOption } from '@/contracting/components/implement-option';
import { ReadAtField } from '@/contracting/components/ReadAtField';
import { useDrivers, useImplements } from '@/contracting/jobs/use-jobs';
import { chooseMeterPhoto, type PhotoSource } from '@/contracting/lib/photo-picker';
import { recordReadingCaptured } from '@/contracting/observability';
import { type AttemptIdentity, captureAttempt, captureAttemptPayload } from '@/contracting/readings/capture-attempt';
import { deriveCapture } from '@/contracting/readings/derive-capture';
import { capturedAtFor, isBackdated, isFutureReadAt, parseExifDateTime } from '@/contracting/readings/read-at';
import { CAPTURE_FAILED, captureReading, ReadingRefusedError } from '@/contracting/readings/reading-upload';
import { useFleet, useMachineReadings } from '@/contracting/readings/use-fleet';
import { useSessionAccessSummary, useSessionPermission } from '@/lib/auth-session';
import { addBreadcrumb, captureException, captureSanitizedException } from '@/lib/observability';
import { useTRPC } from '@/lib/trpc';
import { useBusyAction } from '@/lib/use-busy-action';

const CAMERA_FAILURE = 'The camera could not take a photo. Try again or continue without a photo.';
const GALLERY_FAILURE = 'The photo could not be opened. Try again or continue without a photo.';
/** Refusals that mean the ledger moved under the form: its latest reading must be fetched again. */
const LEDGER_MOVED = new Set<string>(['reading.below_latest', 'reading.previous_changed'] satisfies ReadingErrorCode[]);

type CaptureParams = {
  id: string;
  role?: string;
  assignmentId?: string;
  jobId?: string;
  overrideImplementId?: string;
  overrideDriverUserId?: string;
  implementCode?: string;
  driverName?: string;
  captureSessionId?: string;
};

export default function CaptureScreen() {
  const params = useLocalSearchParams<CaptureParams>();
  const fallbackSessionId = [params.id, params.role, params.assignmentId].join(':');
  return <CaptureForm key={params.captureSessionId ?? fallbackSessionId} params={params} />;
}

function CaptureForm({ params }: { params: CaptureParams }) {
  const { id } = params;
  const role: Exclude<ReadingRole, 'baseline'> =
    params.role === 'arrival' || params.role === 'departure' ? params.role : 'spot';
  const { bottom: safeAreaBottom } = useSafeAreaInsets();
  const fleet = useFleet();
  const machine = fleet.data?.find((row) => row.id === id);
  const readings = useMachineReadings(id);
  const implementsQuery = useImplements();
  const driversQuery = useDrivers();
  const queryClient = useQueryClient();
  const trpc = useTRPC();
  const canCapture = useSessionPermission('contracting_reading:capture');
  const management = fieldJobAccessMode(useSessionAccessSummary()) === 'all';
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [photoSource, setPhotoSource] = useState<PhotoSource | null>(null);
  // Null is "now"; a hand-set Read At survives a new photo, a suggested one does not.
  const [readAt, setReadAt] = useState<Date | null>(null);
  const [readAtEdited, setReadAtEdited] = useState(false);
  const [value, setValue] = useState('');
  const [comment, setComment] = useState('');
  const [disputePrevious, setDisputePrevious] = useState(false);
  const [disputedReadingId, setDisputedReadingId] = useState<string | null>(null);
  const [changeStint, setChangeStint] = useState(false);
  const overrideForm = useAppForm({
    defaultValues: {
      implementId: params.overrideImplementId ?? '',
      driverUserId: params.overrideDriverUserId ?? '',
    },
  });
  const overrides = useStore(overrideForm.store, (state) => state.values);
  const { busy, error, setError, run } = useBusyAction();
  const attempt = useRef<AttemptIdentity | null>(null);
  const latestRow = readings.data?.[0];
  const latest = latestRow ? { id: latestRow.id, value: latestRow.value } : null;
  const commentRequired = role === 'departure' && management && photo === null;
  const { parsed, below, disputeConfirmed, canSave } = deriveCapture({
    value,
    latest,
    disputePrevious,
    disputedReadingId,
    comment,
    commentRequired,
    canCapture,
    machineKnown: !!machine,
    cameraOpen,
    futureReadAt: readAt !== null && isFutureReadAt(readAt),
  });
  async function openCamera() {
    addBreadcrumb('contracting', 'camera permission requested');
    try {
      const result = permission?.granted ? permission : await requestPermission();
      if (result.granted) {
        addBreadcrumb('contracting', 'camera permission granted');
        setCameraReady(false);
        setCameraOpen(true);
      } else {
        addBreadcrumb('contracting', 'camera permission denied');
        setError('Camera permission is unavailable. You can type the reading without a photo.');
      }
    } catch (error) {
      captureException(error, { source: 'camera_permission' });
      setError('Camera unavailable. You can type the reading without a photo.');
    }
  }
  function photograph() {
    return run(async () => {
      const result = await camera.current?.takePictureAsync({ quality: 0.7 }).catch((error) => {
        captureSanitizedException(error, 'Camera capture failed', { source: 'camera_capture' });
        return undefined;
      });
      setCameraOpen(false);
      if (!result) throw new Error(CAMERA_FAILURE);
      attachPhoto(result.uri, 'camera', null);
    }, CAMERA_FAILURE);
  }
  function chooseFromGallery() {
    return run(async () => {
      const chosen = await chooseMeterPhoto().catch((error) => {
        captureSanitizedException(error, 'Gallery pick failed', { source: 'gallery_pick' });
        throw new Error(GALLERY_FAILURE);
      });
      if (chosen) attachPhoto(chosen.uri, 'gallery', parseExifDateTime(chosen.exif));
    }, GALLERY_FAILURE);
  }
  function attachPhoto(uri: string | null, source: PhotoSource | null, takenAt: Date | null) {
    setPhoto(uri);
    setPhotoSource(source);
    if (takenAt) {
      setReadAt(takenAt);
      setReadAtEdited(false);
    } else if (!readAtEdited) setReadAt(null);
  }
  function save() {
    if (!canSave || !parsed?.success) return;
    const reading = parsed.data;
    const stintOverrides =
      role === 'arrival' && params.assignmentId && changeStint
        ? { implementId: overrides.implementId || null, driverUserId: overrides.driverUserId || null }
        : undefined;
    // Name the latest only once history has loaded; the server then refuses a capture judged against an older one.
    const expectedPreviousId = readings.data ? (latest?.id ?? null) : undefined;
    // Only what the Foreman entered: a reconnect refetches history, and a retry after it must still replay.
    attempt.current = captureAttempt(
      attempt.current,
      captureAttemptPayload({
        role,
        assignmentId: params.assignmentId ?? null,
        value: reading,
        photo,
        comment,
        disputePrevious,
        stintOverrides: stintOverrides ?? null,
        readAt,
      }),
    );
    const { localId, attemptedAt } = attempt.current;
    const capturedAt = capturedAtFor(readAt, attemptedAt);
    const captured = {
      role,
      hasPhoto: photo !== null,
      photoSource: photo !== null ? photoSource : null,
      backdated: isBackdated(readAt, attemptedAt),
    };
    return run(async () => {
      try {
        const row = await captureReading(
          {
            localId,
            machineId: id,
            role,
            ...(params.assignmentId ? { assignmentId: params.assignmentId } : {}),
            ...(stintOverrides ? { stintOverrides } : {}),
            value: reading,
            capturedAt,
            comment: comment.trim() || null,
            disputePrevious: disputeConfirmed,
            ...(expectedPreviousId !== undefined ? { expectedPreviousId } : {}),
          },
          photo,
        );
        recordReadingCaptured({ ...captured, refused: null });
        queryClient.setQueryData(trpc.contractingReadings.fieldHistory.queryKey({ machineId: id }), (rows) => [
          row,
          ...(rows ?? []).filter((candidate) => candidate.id !== row.id),
        ]);
        void Promise.all([
          queryClient.invalidateQueries({ queryKey: trpc.contractingReadings.pathKey() }),
          queryClient.invalidateQueries({ queryKey: trpc.contractingJobs.field.pathKey() }),
        ]);
        router.replace((params.jobId ? `/contracting/jobs/${params.jobId}` : `/contracting/machines/${id}`) as Href);
      } catch (error) {
        if (error instanceof ReadingRefusedError) {
          recordReadingCaptured({ ...captured, refused: error.code });
          if (LEDGER_MOVED.has(error.code)) {
            setDisputePrevious(false);
            void queryClient.invalidateQueries({
              queryKey: trpc.contractingReadings.fieldHistory.queryKey({ machineId: id }),
            });
          }
          setError(error.message);
          return;
        }
        captureSanitizedException(error, 'Reading capture failed', { source: 'reading_capture' });
        throw error;
      }
    }, CAPTURE_FAILED);
  }
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title={role === 'arrival' ? 'Capture arrival' : role === 'departure' ? 'Capture departure' : 'Capture reading'}
        subtitle={machine?.code ?? 'CONTRACTING'}
        parentLabel={params.jobId ? 'Job' : 'Machine'}
        onBack={() => {
          if (!busy)
            router.replace(
              (params.jobId ? `/contracting/jobs/${params.jobId}` : `/contracting/machines/${id}`) as Href,
            );
        }}
        helpTopic="contractingMobileCapture"
      />
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} className="flex-1">
        <ScrollView
          keyboardDismissMode={Platform.OS === 'ios' ? 'interactive' : 'on-drag'}
          keyboardShouldPersistTaps="handled"
          contentContainerStyle={{ padding: 16, gap: 16 }}
        >
          <Text className="text-muted-foreground">Photograph the hour meter when you can, then type its value.</Text>
          {role === 'arrival' && params.assignmentId ? (
            <View className="gap-3 rounded-xl border border-border bg-surface p-4">
              <View className="flex-row items-center justify-between gap-3">
                <Text className="min-w-0 flex-1 text-sm text-foreground">
                  Starting with {params.implementCode || 'no implement'} · driver {params.driverName || 'not set'}
                </Text>
                <Button title={changeStint ? 'Keep planned' : 'Change'} onPress={() => setChangeStint(!changeStint)} />
              </View>
              {changeStint ? (
                <View className="gap-3">
                  <overrideForm.AppField name="implementId">
                    {(field) => (
                      <field.SearchSelectField
                        label="Implement"
                        placeholder="No implement"
                        searchPlaceholder="Search by code or category…"
                        emptyMessage="No Implements match."
                        options={[
                          { label: 'No implement', value: '' },
                          ...(implementsQuery.data ?? []).map((row) => ({
                            ...implementOption(row, row.onSiteJobNumber),
                            disabled: row.onSiteJobNumber !== null,
                          })),
                        ]}
                      />
                    )}
                  </overrideForm.AppField>
                  <overrideForm.AppField name="driverUserId">
                    {(field) => (
                      <field.SearchSelectField
                        label="Driver"
                        placeholder="No driver"
                        searchPlaceholder="Search drivers…"
                        emptyMessage="No drivers match."
                        options={[
                          { label: 'No driver', value: '' },
                          ...(driversQuery.data ?? []).map((row) => ({ label: row.name, value: row.id })),
                        ]}
                      />
                    )}
                  </overrideForm.AppField>
                </View>
              ) : null}
            </View>
          ) : null}
          {cameraOpen && permission?.granted ? (
            <View className="gap-3">
              <View className="h-72 overflow-hidden rounded-xl bg-image-backdrop">
                <CameraView
                  ref={camera}
                  facing="back"
                  onCameraReady={() => setCameraReady(true)}
                  onMountError={() => {
                    setCameraOpen(false);
                    setError('Camera unavailable. Continue without a photo if needed.');
                  }}
                  style={{ flex: 1 }}
                />
                <View pointerEvents="none" className="absolute inset-0 items-center justify-center">
                  <View className="h-24 w-4/5 rounded-xl border-2 border-white" />
                  <Text className="mt-3 text-white">Keep every digit sharp and inside the guide</Text>
                </View>
              </View>
              <Button
                title="Take photo"
                disabled={busy || !cameraReady}
                onPress={() => {
                  void photograph();
                }}
              />
              <Button title="Continue without a photo" disabled={busy} onPress={() => setCameraOpen(false)} />
            </View>
          ) : (
            <View className="gap-3">
              {photo ? (
                <Image
                  accessibilityLabel="Meter photo"
                  source={{ uri: photo }}
                  className="h-56 w-full rounded-xl"
                  resizeMode="contain"
                />
              ) : (
                <Text className="text-muted-foreground">Missing Photo Evidence · no photo attached</Text>
              )}
              <Button
                title={photo ? 'Retake photo' : 'Photograph meter'}
                disabled={busy}
                onPress={() => {
                  void openCamera();
                }}
              />
              <Button
                title="Choose from gallery"
                disabled={busy}
                onPress={() => {
                  void chooseFromGallery();
                }}
              />
              {photo ? (
                <Button title="Remove photo" disabled={busy} onPress={() => attachPhoto(null, null, null)} />
              ) : null}
            </View>
          )}
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
              setDisputePrevious(false);
            }}
          />
          {value && !parsed?.success ? (
            <Text className="text-danger">Enter a non-negative value with at most one decimal place.</Text>
          ) : null}
          <Text className="text-foreground" weight="semibold">
            Read At
          </Text>
          <ReadAtField
            value={readAt}
            disabled={busy}
            onChange={(next) => {
              setReadAt(next);
              setReadAtEdited(next !== null);
            }}
          />
          {readAt && isFutureReadAt(readAt) ? <Text className="text-danger">{FUTURE_READ_AT_REFUSAL}</Text> : null}
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
                onPress={() => {
                  setDisputedReadingId(latest?.id ?? null);
                  setDisputePrevious(!disputeConfirmed);
                }}
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
