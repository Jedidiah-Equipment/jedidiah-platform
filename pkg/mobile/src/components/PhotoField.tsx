import { IconCamera, IconPhoto, IconPhotoScan, IconTrash, type Icon as TablerIcon } from '@tabler/icons-react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import { type ReactNode, useRef, useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { addBreadcrumb, captureException } from '@/lib/observability';

/** Points, not rem: one height for the empty, camera and preview states, so the form never jumps. */
const CARD_HEIGHT = 224;

export type PhotoFieldMode = 'empty' | 'camera' | 'preview';

/**
 * One photo slot, the native sibling of web's `AttachmentField`: a fixed-height card that offers Take photo and
 * Gallery, opens an in-card camera, and turns into a preview with Retake, Replace and Remove once a photo is chosen.
 * The owner keeps the photo and decides what a capture or a gallery pick means.
 */
export function PhotoField({
  label,
  emptyTitle,
  emptyHint,
  photoUri,
  busy,
  cameraOpen,
  onCameraOpenChange,
  onCapture,
  onChooseFromGallery,
  onRemove,
  onError,
  guide,
}: {
  label: string;
  /** The empty card's line, e.g. "Attach meter photo". */
  emptyTitle: string;
  emptyHint: string;
  photoUri: string | null;
  busy: boolean;
  /** Controlled, so the owner can hold its own actions while the camera is open. */
  cameraOpen: boolean;
  onCameraOpenChange: (open: boolean) => void;
  /** Takes the picture from the open camera; the owner reports failures through its own action. */
  onCapture: (camera: CameraView) => void;
  onChooseFromGallery: () => void;
  onRemove: () => void;
  onError: (message: string) => void;
  /** Drawn over the viewfinder, e.g. a frame to keep the meter's digits in. */
  guide?: ReactNode;
}) {
  const [permission, requestPermission] = useCameraPermissions();
  const camera = useRef<CameraView>(null);
  const [cameraReady, setCameraReady] = useState(false);
  const mode: PhotoFieldMode = cameraOpen && permission?.granted ? 'camera' : photoUri ? 'preview' : 'empty';

  async function openCamera() {
    addBreadcrumb('camera', 'camera permission requested');
    try {
      const result = permission?.granted ? permission : await requestPermission();
      if (!result.granted) {
        addBreadcrumb('camera', 'camera permission denied');
        onError('Camera permission is unavailable. Choose a photo from the gallery instead.');
        return;
      }
      setCameraReady(false);
      onCameraOpenChange(true);
    } catch (error) {
      captureException(error, { source: 'camera_permission' });
      onError('Camera unavailable. Choose a photo from the gallery instead.');
    }
  }

  return (
    <View className="gap-2">
      <Text className="text-sm text-foreground" weight="semibold">
        {label}
      </Text>
      <View
        className={`overflow-hidden rounded-xl border border-border ${mode === 'empty' ? 'border-dashed bg-surface' : 'bg-image-backdrop'}`}
        style={{ height: CARD_HEIGHT }}
      >
        {mode === 'camera' ? (
          <>
            <CameraView
              ref={camera}
              facing="back"
              onCameraReady={() => setCameraReady(true)}
              onMountError={() => {
                onCameraOpenChange(false);
                onError('Camera unavailable. Choose a photo from the gallery instead.');
              }}
              style={{ flex: 1 }}
            />
            {guide ? (
              <View pointerEvents="none" className="absolute inset-0 items-center justify-center pb-14">
                {guide}
              </View>
            ) : null}
            <CardActions
              start={<Button title="Cancel" disabled={busy} onPress={() => onCameraOpenChange(false)} />}
              end={
                <Button
                  primary
                  icon={IconCamera}
                  title="Capture"
                  disabled={busy || !cameraReady}
                  onPress={() => {
                    if (camera.current) onCapture(camera.current);
                  }}
                />
              }
            />
          </>
        ) : mode === 'preview' && photoUri ? (
          <>
            <Image
              accessibilityLabel={`Selected ${label.toLowerCase()}`}
              source={{ uri: photoUri }}
              style={{ flex: 1 }}
              resizeMode="contain"
            />
            <View className="absolute top-2 right-2 flex-row gap-2">
              <IconButton
                icon={IconCamera}
                label={`Retake ${label.toLowerCase()}`}
                disabled={busy}
                onPress={() => {
                  void openCamera();
                }}
              />
              <IconButton
                icon={IconPhoto}
                label={`Replace ${label.toLowerCase()} from the gallery`}
                disabled={busy}
                onPress={onChooseFromGallery}
              />
              <IconButton icon={IconTrash} label={`Remove ${label.toLowerCase()}`} disabled={busy} onPress={onRemove} />
            </View>
          </>
        ) : (
          <>
            <View className="flex-1 items-center justify-center gap-1 px-4">
              <Icon className="text-muted-foreground" icon={IconPhotoScan} size={28} />
              <Text className="text-sm text-foreground" weight="semibold">
                {emptyTitle}
              </Text>
              <Text className="text-center text-xs text-muted-foreground">{emptyHint}</Text>
            </View>
            <CardActions
              start={
                <Button
                  primary
                  icon={IconCamera}
                  title="Take photo"
                  disabled={busy}
                  onPress={() => {
                    void openCamera();
                  }}
                />
              }
              end={<Button icon={IconPhoto} title="Gallery" disabled={busy} onPress={onChooseFromGallery} />}
            />
          </>
        )}
      </View>
    </View>
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
