import { MISSING_PHOTO_EVIDENCE } from '@pkg/domain/contracting';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { useRef, useState } from 'react';
import { Image, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Text } from '@/components/ui/text';
import { chooseMeterPhoto, type PhotoSource } from '@/contracting/lib/photo-picker';
import { parseExifDateTime } from '@/contracting/readings/read-at';
import { addBreadcrumb, captureException, captureSanitizedException } from '@/lib/observability';
import type { useBusyAction } from '@/lib/use-busy-action';

const CAMERA_FAILURE = 'The camera could not take a photo. Try again or continue without a photo.';
const GALLERY_FAILURE = 'The photo could not be opened. Try again or continue without a photo.';

export type MeterPhoto = { uri: string; source: PhotoSource };

export function MeterPhotoField({
  photo,
  cameraOpen,
  onCameraOpenChange,
  onChange,
  action,
}: {
  photo: MeterPhoto | null;
  /** Controlled by the form: Save stays disabled while the camera is open. */
  cameraOpen: boolean;
  onCameraOpenChange: (open: boolean) => void;
  /** `takenAt` is a gallery photo's EXIF time; null for a camera photo and for removal. */
  onChange: (photo: MeterPhoto | null, takenAt: Date | null) => void;
  /** The form's busy action: photo work shares its lock and its error line. */
  action: Pick<ReturnType<typeof useBusyAction>, 'busy' | 'run' | 'setError'>;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  async function openCamera() {
    addBreadcrumb('contracting', 'camera permission requested');
    try {
      const result = permission?.granted ? permission : await requestPermission();
      if (result.granted) {
        addBreadcrumb('contracting', 'camera permission granted');
        setCameraReady(false);
        onCameraOpenChange(true);
      } else {
        addBreadcrumb('contracting', 'camera permission denied');
        action.setError('Camera permission is unavailable. You can type the reading without a photo.');
      }
    } catch (error) {
      captureException(error, { source: 'camera_permission' });
      action.setError('Camera unavailable. You can type the reading without a photo.');
    }
  }
  function photograph() {
    return action.run(async () => {
      const result = await camera.current?.takePictureAsync({ quality: 0.7 }).catch((error) => {
        captureSanitizedException(error, 'Camera capture failed', { source: 'camera_capture' });
        return undefined;
      });
      onCameraOpenChange(false);
      if (!result) throw new Error(CAMERA_FAILURE);
      onChange({ uri: result.uri, source: 'camera' }, null);
    }, CAMERA_FAILURE);
  }
  function chooseFromGallery() {
    return action.run(async () => {
      const chosen = await chooseMeterPhoto().catch((error) => {
        captureSanitizedException(error, 'Gallery pick failed', { source: 'gallery_pick' });
        throw new Error(GALLERY_FAILURE);
      });
      if (chosen) onChange({ uri: chosen.uri, source: 'gallery' }, parseExifDateTime(chosen.exif));
    }, GALLERY_FAILURE);
  }
  return cameraOpen && permission?.granted ? (
    <View className="gap-3">
      <View className="h-72 overflow-hidden rounded-xl bg-image-backdrop">
        <CameraView
          ref={camera}
          facing="back"
          onCameraReady={() => setCameraReady(true)}
          onMountError={() => {
            onCameraOpenChange(false);
            action.setError('Camera unavailable. Continue without a photo if needed.');
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
        disabled={action.busy || !cameraReady}
        onPress={() => {
          void photograph();
        }}
      />
      <Button title="Continue without a photo" disabled={action.busy} onPress={() => onCameraOpenChange(false)} />
    </View>
  ) : (
    <View className="gap-3">
      {photo ? (
        <Image
          accessibilityLabel="Meter photo"
          source={{ uri: photo.uri }}
          className="h-56 w-full rounded-xl"
          resizeMode="contain"
        />
      ) : (
        <Text className="text-muted-foreground">{MISSING_PHOTO_EVIDENCE} · no photo attached</Text>
      )}
      <Button
        title={photo ? 'Retake photo' : 'Photograph meter'}
        disabled={action.busy}
        onPress={() => {
          void openCamera();
        }}
      />
      <Button
        title="Choose from gallery"
        disabled={action.busy}
        onPress={() => {
          void chooseFromGallery();
        }}
      />
      {photo ? <Button title="Remove photo" disabled={action.busy} onPress={() => onChange(null, null)} /> : null}
    </View>
  );
}
