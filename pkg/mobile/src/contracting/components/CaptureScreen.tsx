import { fieldJobAccessMode } from '@pkg/domain/contracting';
import { ReadingComment } from '@pkg/schema/contracting';
import { useStore } from '@tanstack/react-form';
import { onlineManager } from '@tanstack/react-query';
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
import { useDrivers, useImplements } from '@/contracting/jobs/use-jobs';
import { recordReadingCaptured } from '@/contracting/observability';
import { deriveCapture } from '@/contracting/readings/derive-capture';
import { latestKnownReading } from '@/contracting/readings/latest-reading';
import { useReadingQueue } from '@/contracting/readings/ReadingQueueProvider';
import { keepReadingPhoto, removeReadingPhoto } from '@/contracting/readings/reading-files';
import { newLocalId } from '@/contracting/readings/reading-queue';
import { useFleet, useMachineReadings } from '@/contracting/readings/use-fleet';
import { useSessionAccessSummary, useSessionPermission } from '@/lib/auth-session';
import { addBreadcrumb, captureException } from '@/lib/observability';
import { useBusyAction } from '@/lib/use-busy-action';

const CAMERA_FAILURE = 'The camera could not take a photo. Try again or continue without a photo.';

type CaptureParams = {
  id: string;
  role?: string;
  assignmentId?: string;
  jobId?: string;
  startAssignmentJobId?: string;
  implementId?: string;
  driverUserId?: string;
  startLocalId?: string;
  overrideImplementId?: string;
  overrideDriverUserId?: string;
  implementCode?: string;
  driverName?: string;
  captureSessionId?: string;
};

export default function CaptureScreen() {
  const params = useLocalSearchParams<CaptureParams>();
  const fallbackSessionId = [params.id, params.role, params.assignmentId, params.startLocalId].join(':');
  return <CaptureForm key={params.captureSessionId ?? fallbackSessionId} params={params} />;
}

function CaptureForm({ params }: { params: CaptureParams }) {
  const { id } = params;
  const role = params.role === 'arrival' || params.role === 'departure' ? params.role : 'spot';
  const { bottom: safeAreaBottom } = useSafeAreaInsets();
  const fleet = useFleet();
  const machine = fleet.data?.find((row) => row.id === id);
  const readings = useMachineReadings(id);
  const { queue, items } = useReadingQueue();
  const implementsQuery = useImplements();
  const driversQuery = useDrivers();
  const canCapture = useSessionPermission('contracting_reading:capture');
  const management = fieldJobAccessMode(useSessionAccessSummary()) === 'all';
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
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
  const known = latestKnownReading(id, items, readings.data);
  const latest = known?.value;
  const latestId = known?.id ?? null;
  const commentRequired = role === 'departure' && management && photo === null;
  const { parsed, below, disputeConfirmed, missingComment, canSave } = deriveCapture({
    value,
    latest,
    latestId,
    disputePrevious,
    disputedReadingId,
    canCapture,
    machineKnown: !!machine,
    cameraOpen,
    comment,
    commentRequired,
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
        captureException(error, { source: 'camera_capture' });
        return undefined;
      });
      setCameraOpen(false);
      if (!result) throw new Error(CAMERA_FAILURE);
      setPhoto(result.uri);
    }, CAMERA_FAILURE);
  }
  function save() {
    if (!canSave || !parsed?.success) return;
    const reading = parsed.data;
    return run(async () => {
      const localId = newLocalId();
      const photoLocalUri = photo ? await keepReadingPhoto(photo, localId) : null;
      try {
        const queued = {
          localId,
          machineId: id,
          role,
          ...(params.assignmentId ? { assignmentId: params.assignmentId } : {}),
          ...(params.startLocalId && params.startAssignmentJobId
            ? {
                startAssignment: {
                  localId: params.startLocalId,
                  jobId: params.startAssignmentJobId,
                  implementId: params.implementId || null,
                  ...(params.driverUserId ? { driverUserId: params.driverUserId } : {}),
                },
              }
            : {}),
          ...(role === 'arrival' && params.assignmentId && changeStint
            ? {
                stintOverrides: {
                  implementId: overrides.implementId || null,
                  driverUserId: overrides.driverUserId || null,
                },
              }
            : {}),
          value: reading,
          capturedAt: new Date().toISOString(),
          photoLocalUri,
          comment: comment.trim() || null,
          disputePrevious: disputeConfirmed,
          expectedPreviousId: latestId,
        } as const;
        await queue.enqueue(queued);
        recordReadingCaptured(queued, !onlineManager.isOnline());
      } catch (error) {
        if (photoLocalUri)
          await removeReadingPhoto(photoLocalUri).catch((cleanupError) =>
            captureException(cleanupError, { source: 'reading_photo_cleanup' }),
          );
        throw error;
      }
      router.replace((params.jobId ? `/contracting/jobs/${params.jobId}` : `/contracting/machines/${id}`) as Href);
    }, 'Capture could not be saved. Please try again.');
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
          <Text className="text-muted-foreground">
            Photograph the hour meter when you can, then type its value. Your capture is saved on this phone before
            syncing.
          </Text>
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
                      <field.SelectField
                        label="Implement"
                        options={[
                          { label: 'No implement', value: '' },
                          ...(implementsQuery.data ?? []).map((row) => ({
                            label: row.onSiteJobNumber ? `${row.code} · On Job · ${row.onSiteJobNumber}` : row.code,
                            value: row.id,
                            disabled: row.onSiteJobNumber !== null,
                          })),
                        ]}
                      />
                    )}
                  </overrideForm.AppField>
                  <overrideForm.AppField name="driverUserId">
                    {(field) => (
                      <field.SelectField
                        label="Driver"
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
              {photo ? <Button title="Remove photo" disabled={busy} onPress={() => setPhoto(null)} /> : null}
            </View>
          )}
          <View className="flex-row items-baseline justify-between">
            <Text className="text-foreground" weight="semibold">
              Hour meter value
            </Text>
            {latest !== undefined ? (
              <Text className="text-sm text-muted-foreground">Minimum allowed: {latest.toFixed(1)} h</Text>
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
          {missingComment ? <Text className="text-danger">Explain why this departure has no meter photo.</Text> : null}
          {below ? (
            <View className="gap-3 rounded-xl border border-danger p-4">
              <Text className="text-foreground">
                This is below the minimum allowed. Correct your value, retake the photo, or dispute the previous
                reading.
              </Text>
              <Button
                title={disputeConfirmed ? 'Previous reading disputed · undo' : 'The previous reading is wrong'}
                onPress={() => {
                  setDisputedReadingId(latestId);
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
