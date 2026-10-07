import { IconCamera, IconPhoto, IconPhotoScan, IconTrash, type Icon as TablerIcon } from '@tabler/icons-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { type ReactNode, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { FieldShell } from '@/components/form/fields/FieldShell';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { addBreadcrumb, captureException, captureSanitizedException } from '@/lib/observability';
import { choosePhoto, PHOTO_QUALITY, type PickedPhoto } from '@/lib/photo-picker';
import type { useBusyAction } from '@/lib/use-busy-action';

/** Points, not rem: one height for the empty, camera and preview states, so the form never jumps. */
const CARD_HEIGHT = 224;

const CAMERA_FAILURE = 'The camera could not take a photo. Try again or continue without a photo.';
const GALLERY_FAILURE = 'The photo could not be opened. Try again or continue without a photo.';
const CAMERA_UNAVAILABLE = 'Camera unavailable. Choose a photo from the gallery instead.';

/**
 * One photo slot, the native sibling of web's `AttachmentField`: a fixed-height card that offers Take photo and
 * Gallery, opens an in-card camera, and turns into a preview with Retake, Replace and Remove once a photo is chosen.
 * It takes and picks the photo itself, under the owner's busy action, and hands back what was picked.
 */
export function PhotoField({
  label,
  emptyTitle,
  emptyHint,
  photoUri,
  cameraOpen,
  onCameraOpenChange,
  onChange,
  action,
  guide,
}: {
  label: string;
  /** The empty card's line, e.g. "Attach meter photo". */
  emptyTitle: string;
  emptyHint: string;
  photoUri: string | null;
  /** Controlled, so the owner can hold its own actions while the camera is open. */
  cameraOpen: boolean;
  onCameraOpenChange: (open: boolean) => void;
  /** Null when the photo is removed. */
  onChange: (photo: PickedPhoto | null) => void;
  /** The owner's busy action: photo work shares its lock and its error line. */
  action: Pick<ReturnType<typeof useBusyAction>, 'busy' | 'run' | 'setError'>;
  /** Drawn over the viewfinder, e.g. a frame to keep the meter's digits in. */
  guide?: ReactNode;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const { busy } = action;
  const subject = label.toLowerCase();

  async function openCamera() {
    addBreadcrumb('camera', 'camera permission requested');
    try {
      const result = permission?.granted ? permission : await requestPermission();
      if (!result.granted) {
        addBreadcrumb('camera', 'camera permission denied');
        action.setError('Camera permission is unavailable. Choose a photo from the gallery instead.');
        return;
      }
      onCameraOpenChange(true);
    } catch (error) {
      captureException(error, { source: 'camera_permission' });
      action.setError(CAMERA_UNAVAILABLE);
    }
  }

  function take(camera: CameraView) {
    void action.run(async () => {
      const result = await camera.takePictureAsync({ quality: PHOTO_QUALITY }).catch((error) => {
        captureSanitizedException(error, 'Camera capture failed', { source: 'camera_capture' });
        return undefined;
      });
      onCameraOpenChange(false);
      if (!result) throw new Error(CAMERA_FAILURE);
      onChange({ uri: result.uri, source: 'camera', exif: null, inGallery: false });
    }, CAMERA_FAILURE);
  }

  function chooseFromGallery() {
    void action.run(async () => {
      const chosen = await choosePhoto().catch((error) => {
        captureSanitizedException(error, 'Gallery pick failed', { source: 'gallery_pick' });
        throw new Error(GALLERY_FAILURE);
      });
      if (chosen) onChange(chosen);
    }, GALLERY_FAILURE);
  }

  const card =
    cameraOpen && permission?.granted ? (
      <CameraCard
        busy={busy}
        guide={guide}
        onCancel={() => onCameraOpenChange(false)}
        onTake={take}
        onMountError={() => {
          onCameraOpenChange(false);
          action.setError(CAMERA_UNAVAILABLE);
        }}
      />
    ) : photoUri ? (
      <PreviewCard
        uri={photoUri}
        subject={subject}
        busy={busy}
        onRetake={() => void openCamera()}
        onReplace={chooseFromGallery}
        onRemove={() => onChange(null)}
      />
    ) : (
      <EmptyCard
        title={emptyTitle}
        hint={emptyHint}
        busy={busy}
        onTake={() => void openCamera()}
        onChoose={chooseFromGallery}
      />
    );
  return <FieldShell label={label}>{card}</FieldShell>;
}

function Card({ dashed = false, children }: { dashed?: boolean; children: ReactNode }) {
  return (
    <View
      className={`overflow-hidden rounded-xl border border-border ${dashed ? 'border-dashed bg-surface' : 'bg-image-backdrop'}`}
      style={{ height: CARD_HEIGHT }}
    >
      {children}
    </View>
  );
}

/** Mounted only while the camera is open, so it starts not ready each time. */
function CameraCard({
  busy,
  guide,
  onCancel,
  onTake,
  onMountError,
}: {
  busy: boolean;
  guide: ReactNode;
  onCancel: () => void;
  onTake: (camera: CameraView) => void;
  onMountError: () => void;
}) {
  const camera = useRef<CameraView>(null);
  const [ready, setReady] = useState(false);
  return (
    <Card>
      <CameraView
        ref={camera}
        facing="back"
        onCameraReady={() => setReady(true)}
        onMountError={onMountError}
        style={{ flex: 1 }}
      />
      {guide ? (
        <View pointerEvents="none" className="absolute inset-0 items-center justify-center pb-14">
          {guide}
        </View>
      ) : null}
      <CardActions
        start={<Button title="Cancel" disabled={busy} onPress={onCancel} />}
        end={
          <Button
            primary
            icon={IconCamera}
            title="Capture"
            disabled={busy || !ready}
            onPress={() => {
              if (camera.current) onTake(camera.current);
            }}
          />
        }
      />
    </Card>
  );
}

function PreviewCard({
  uri,
  subject,
  busy,
  onRetake,
  onReplace,
  onRemove,
}: {
  uri: string;
  subject: string;
  busy: boolean;
  onRetake: () => void;
  onReplace: () => void;
  onRemove: () => void;
}) {
  return (
    <Card>
      <Image accessibilityLabel={`Selected ${subject}`} source={{ uri }} style={{ flex: 1 }} resizeMode="contain" />
      <View className="absolute top-2 right-2 flex-row gap-2">
        <IconButton icon={IconCamera} label={`Retake ${subject}`} disabled={busy} onPress={onRetake} />
        <IconButton
          icon={IconPhoto}
          label={`Replace ${subject} from the gallery`}
          disabled={busy}
          onPress={onReplace}
        />
        <IconButton icon={IconTrash} label={`Remove ${subject}`} disabled={busy} onPress={onRemove} />
      </View>
    </Card>
  );
}

function EmptyCard({
  title,
  hint,
  busy,
  onTake,
  onChoose,
}: {
  title: string;
  hint: string;
  busy: boolean;
  onTake: () => void;
  onChoose: () => void;
}) {
  return (
    <Card dashed>
      <View className="flex-1 items-center justify-center gap-1 px-4">
        <Icon className="text-muted-foreground" icon={IconPhotoScan} size={28} />
        <Text className="text-sm text-foreground" weight="semibold">
          {title}
        </Text>
        <Text className="text-center text-xs text-muted-foreground">{hint}</Text>
      </View>
      <CardActions
        start={<Button primary icon={IconCamera} title="Take photo" disabled={busy} onPress={onTake} />}
        end={<Button icon={IconPhoto} title="Gallery" disabled={busy} onPress={onChoose} />}
      />
    </Card>
  );
}

/** The card's bottom row: two buttons sharing the width equally. */
function CardActions({ start, end }: { start: ReactNode; end: ReactNode }) {
  return (
    <View className="flex-row gap-2 p-3">
      <View className="flex-1">{start}</View>
      <View className="flex-1">{end}</View>
    </View>
  );
}

function IconButton({
  icon,
  label,
  disabled,
  onPress,
}: {
  icon: TablerIcon;
  label: string;
  disabled: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      className={`items-center justify-center rounded-full bg-black/60 ${disabled ? 'opacity-50' : ''}`}
      style={{ width: 40, height: 40 }}
    >
      <Icon className="text-white" icon={icon} size={18} />
    </Pressable>
  );
}
