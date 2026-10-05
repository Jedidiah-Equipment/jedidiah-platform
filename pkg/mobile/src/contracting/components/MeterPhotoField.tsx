import { View } from 'react-native';
import { PhotoField } from '@/components/PhotoField';
import { Text } from '@/components/ui/text';
import { parseExifDateTime } from '@/contracting/readings/read-at';
import type { PhotoSource } from '@/lib/photo-picker';
import type { useBusyAction } from '@/lib/use-busy-action';

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
  action: Pick<ReturnType<typeof useBusyAction>, 'busy' | 'run' | 'setError'>;
}) {
  return (
    <PhotoField
      label="Meter photo"
      emptyTitle="Attach meter photo"
      emptyHint="Photograph the hour meter, or choose a photo taken earlier"
      photoUri={photo?.uri ?? null}
      cameraOpen={cameraOpen}
      onCameraOpenChange={onCameraOpenChange}
      onChange={(picked) =>
        onChange(picked && { uri: picked.uri, source: picked.source }, parseExifDateTime(picked?.exif))
      }
      action={action}
      guide={
        <>
          <View className="h-16 w-4/5 rounded-xl border-2 border-white" />
          <Text className="mt-2 text-xs text-white">Keep every digit sharp and inside the guide</Text>
        </>
      }
    />
  );
}
