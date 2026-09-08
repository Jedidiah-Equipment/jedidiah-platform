import { ReadingValue } from '@pkg/schema/contracting';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { router, useLocalSearchParams } from 'expo-router';
import { useRef, useState } from 'react';
import { Image, ScrollView, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SecondaryToolbar } from '@/components/TopToolbar';
import { Text } from '@/components/ui/text';
import { TextInput } from '@/components/ui/text-input';
import { useReadingQueue } from '@/contracting/readings/ReadingQueueProvider';
import { keepReadingPhoto, removeReadingPhoto } from '@/contracting/readings/reading-files';
import { useCapturePermission } from '@/contracting/readings/use-capture-permission';
import { useFleet, useMachineReadings } from '@/contracting/readings/use-fleet';
import { ReadingButton } from './ReadingButton';

export default function CaptureScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const fleet = useFleet(false);
  const machine = fleet.data?.find((row) => row.id === id);
  const readings = useMachineReadings(id, false);
  const { queue, items } = useReadingQueue();
  const canCapture = useCapturePermission();
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [cameraOpen, setCameraOpen] = useState(false);
  const [cameraReady, setCameraReady] = useState(false);
  const [photo, setPhoto] = useState<string | null>(null);
  const [value, setValue] = useState('');
  const [disputePrevious, setDisputePrevious] = useState(false);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [error, setError] = useState<string | null>(null);
  const localLatest = items
    .filter((row) => row.machineId === id)
    .sort((a, b) => Date.parse(b.capturedAt) - Date.parse(a.capturedAt))[0];
  const synced = readings.data?.[0];
  const latest =
    localLatest && (!synced || Date.parse(localLatest.capturedAt) >= Date.parse(synced.capturedAt))
      ? localLatest.value
      : synced?.value;
  const parsed = value.trim() ? ReadingValue.safeParse(Number(value.replace(',', '.'))) : null;
  const below = parsed?.success && latest !== undefined && parsed.data < latest;
  async function photograph() {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try {
      const result = await camera.current?.takePictureAsync({ quality: 0.7 });
      if (!result) throw new Error('Camera unavailable. Try again or continue without a photo.');
      setPhoto(result.uri);
      setCameraOpen(false);
    } catch {
      setError('The camera could not take a photo. Try again or continue without a photo.');
      setCameraOpen(false);
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  async function save() {
    if (busyRef.current || !parsed?.success || (below && !disputePrevious) || !canCapture || !machine) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    // Random UUIDs need no new native dependency; this is an idempotency identifier, not a secret.
    const localId = 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (character) => {
      const random = Math.floor(Math.random() * 16);
      return (character === 'x' ? random : (random & 3) | 8).toString(16);
    });
    let photoLocalUri: string | null = null;
    try {
      if (photo) photoLocalUri = await keepReadingPhoto(photo, localId);
      await queue.enqueue({
        localId,
        machineId: id,
        role: 'spot',
        value: parsed.data,
        capturedAt: new Date().toISOString(),
        photoLocalUri,
        disputePrevious: !!below && disputePrevious,
      });
      router.replace(`/contracting/machines/${id}`);
    } catch (error) {
      if (photoLocalUri) await removeReadingPhoto(photoLocalUri).catch(() => {});
      setError(error instanceof Error ? error.message : 'Capture could not be saved. Please try again.');
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  }
  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      <SecondaryToolbar
        title="Capture reading"
        subtitle={machine?.code ?? 'CONTRACTING'}
        parentLabel="Machine"
        onBack={() => {
          if (!busy) router.replace(`/contracting/machines/${id}`);
        }}
        helpTopic="contractingMobileCapture"
      />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ padding: 16, gap: 16 }}>
        <Text className="text-muted-foreground">
          Photograph the hour meter when you can, then type its value. Your capture is saved on this phone before
          syncing.
        </Text>
        {latest !== undefined ? (
          <Text className="text-foreground">Last known reading: {latest.toFixed(1)} h</Text>
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
            <ReadingButton
              title="Take photo"
              disabled={busy || !cameraReady}
              onPress={() => {
                void photograph();
              }}
            />
            <ReadingButton title="Continue without a photo" disabled={busy} onPress={() => setCameraOpen(false)} />
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
            <ReadingButton
              title={photo ? 'Retake photo' : 'Photograph meter'}
              disabled={busy}
              onPress={() => {
                void (async () => {
                  try {
                    const result = permission?.granted ? permission : await requestPermission();
                    if (result.granted) {
                      setCameraReady(false);
                      setCameraOpen(true);
                    } else setError('Camera permission is unavailable. You can type the reading without a photo.');
                  } catch {
                    setError('Camera unavailable. You can type the reading without a photo.');
                  }
                })();
              }}
            />
            {photo ? <ReadingButton title="Remove photo" disabled={busy} onPress={() => setPhoto(null)} /> : null}
          </View>
        )}
        <Text className="text-foreground" weight="semibold">
          Hour meter value
        </Text>
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
        {below ? (
          <View className="gap-3 rounded-xl border border-danger p-4">
            <Text className="text-foreground">
              This is below the last known reading. Correct your value, retake the photo, or dispute the previous
              reading.
            </Text>
            <ReadingButton
              title={disputePrevious ? 'Previous reading disputed · undo' : 'The previous reading is wrong'}
              onPress={() => setDisputePrevious(!disputePrevious)}
              disabled={busy}
            />
          </View>
        ) : null}
        {error ? (
          <Text className="text-danger" accessibilityRole="alert">
            {error}
          </Text>
        ) : null}
        {!canCapture ? <Text className="text-danger">Your role cannot capture readings.</Text> : null}
        <ReadingButton
          primary
          title={busy ? 'Saving…' : 'Save reading to queue'}
          disabled={busy || cameraOpen || !parsed?.success || (!!below && !disputePrevious) || !canCapture || !machine}
          onPress={() => {
            void save();
          }}
        />
      </ScrollView>
    </SafeAreaView>
  );
}
