import type { CameraView } from 'expo-camera';
import { View } from 'react-native';
import { PhotoField } from '@/components/PhotoField';
import { Text } from '@/components/ui/text';
import { chooseMeterPhoto, type PhotoSource } from '@/contracting/lib/photo-picker';
import { parseExifDateTime } from '@/contracting/readings/read-at';
import { captureSanitizedException } from '@/lib/observability';
import type { useBusyAction } from '@/lib/use-busy-action';

const CAMERA_FAILURE = 'The camera could not take a photo. Try again or continue without a photo.';
const GALLERY_FAILURE = 'The photo could not be opened. Try again or continue without a photo.';

export type MeterPhoto = { uri: string; source: PhotoSource };

/** The hour meter's photo: the shared photo field, with a guide for the digits and the gallery photo's EXIF time. */
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
  function photograph(camera: CameraView) {
    return action.run(async () => {
      const result = await camera.takePictureAsync({ quality: 0.7 }).catch((error) => {
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
  return (
    <PhotoField
      label="Meter photo"
      emptyTitle="Attach meter photo"
      emptyHint="Photograph the hour meter, or choose a photo taken earlier"
      photoUri={photo?.uri ?? null}
      busy={action.busy}
      cameraOpen={cameraOpen}
      onCameraOpenChange={onCameraOpenChange}
      onCapture={(camera) => {
        void photograph(camera);
      }}
      onChooseFromGallery={() => {
        void chooseFromGallery();
      }}
      onRemove={() => onChange(null, null)}
      onError={action.setError}
      guide={
        <>
          <View className="h-16 w-4/5 rounded-xl border-2 border-white" />
          <Text className="mt-2 text-xs text-white">Keep every digit sharp and inside the guide</Text>
        </>
      }
    />
  );
}
