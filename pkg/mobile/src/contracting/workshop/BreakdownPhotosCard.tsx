import { formatNumber } from '@pkg/domain';
import { breakdownPhotoPath } from '@pkg/domain/contracting';
import { BREAKDOWN_MAX_PHOTOS, type BreakdownDetail } from '@pkg/schema/contracting';
import { IconCamera, IconPhoto, IconX } from '@tabler/icons-react-native';
import { useState } from 'react';
import { Image, Pressable, View } from 'react-native';
import { ImageViewer, type ViewerPhoto } from '@/components/ImageViewer';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FadingScrollRow } from '@/components/ui/fading-scroll-row';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { type AuthedFileSource, useAuthedFileSources } from '@/lib/authed-file-source';
import { confirm } from '@/lib/confirm';
import { choosePhotos, type PickedPhoto, takePhoto } from '@/lib/photo-picker';
import { useBusyAction } from '@/lib/use-busy-action';
import { addBreakdownPhotos, PHOTOS_FAILED } from './breakdown-upload';
import { BREAKDOWN_SAVE_FAILED, useBreakdownMutation, useBreakdownUpload } from './use-breakdowns';
import { VerdictGroup } from './VerdictButton';

export function BreakdownPhotosCard({ breakdown }: { breakdown: BreakdownDetail }) {
  const add = useBreakdownUpload((photoUris: string[]) => addBreakdownPhotos(breakdown.id, photoUris));
  const remove = useBreakdownMutation((breakdowns) => breakdowns.removePhoto);
  const [viewing, setViewing] = useState<number | null>(null);
  const photos = useBreakdownPhotos(breakdown);
  const { busy, error, run } = useBusyAction();
  const canChange = breakdown.actions.addPhotos.allowed;
  const left = BREAKDOWN_MAX_PHOTOS - breakdown.photos.length;
  const upload = (pick: () => Promise<PickedPhoto[]>) =>
    run(async () => {
      const picked = await pick();
      if (!picked.length) return;
      await add.mutateAsync(picked.slice(0, left).map((photo) => photo.uri));
    }, PHOTOS_FAILED);
  const removePhoto = async (photoId: string) => {
    if (!(await confirm({ title: 'Remove this photo?', confirmLabel: 'Remove', destructive: true }))) return;
    await run(() => remove.mutateAsync({ id: breakdown.id, photoId }).then(() => undefined), BREAKDOWN_SAVE_FAILED);
  };
  return (
    <Card title={`Photos · ${formatNumber(breakdown.photos.length)}`}>
      {photos.length ? (
        <FadingScrollRow>
          {photos.map((photo, index) => (
            <View key={photo.key} className="h-28 w-28 overflow-hidden rounded-xl bg-image-backdrop">
              <Pressable
                accessibilityLabel={`Open ${photo.label}`}
                accessibilityRole="imagebutton"
                className="h-full w-full"
                onPress={() => setViewing(index)}
              >
                <BreakdownPhoto source={photo.source} />
              </Pressable>
              {canChange ? (
                <Pressable
                  accessibilityLabel={`Remove photo ${formatNumber(index + 1)}`}
                  accessibilityRole="button"
                  disabled={busy}
                  onPress={() => void removePhoto(photo.key)}
                  className="absolute right-1 top-1 h-8 w-8 items-center justify-center rounded-full bg-black/60"
                >
                  <Icon className="text-white" icon={IconX} size={16} />
                </Pressable>
              ) : null}
            </View>
          ))}
        </FadingScrollRow>
      ) : null}
      {error ? <Text className="text-danger">{error}</Text> : null}
      {left > 0 ? (
        <VerdictGroup verdict={breakdown.actions.addPhotos}>
          {(disabled) => (
            <View className="gap-3">
              <Button
                title="Take photo"
                icon={IconCamera}
                disabled={busy || disabled}
                onPress={() => void upload(() => takePhoto({ saveToGallery: true }))}
              />
              <Button
                title="Choose from gallery"
                icon={IconPhoto}
                disabled={busy || disabled}
                onPress={() => void upload(() => choosePhotos(left))}
              />
            </View>
          )}
        </VerdictGroup>
      ) : null}
      <ImageViewer index={viewing} photos={photos} onClose={() => setViewing(null)} onIndexChange={setViewing} />
    </Card>
  );
}

function BreakdownPhoto({ source }: { source: AuthedFileSource }) {
  if (source.kind !== 'ready')
    return (
      <View className="flex-1 items-center justify-center">
        <Text className="text-xs text-muted-foreground">{source.kind === 'loading' ? 'Loading…' : 'Unavailable'}</Text>
      </View>
    );
  // Explicit dimensions avoid react-native-web falling back to the image's intrinsic size.
  return <Image source={{ uri: source.uri }} resizeMode="cover" style={{ height: '100%', width: '100%' }} />;
}

function useBreakdownPhotos(breakdown: BreakdownDetail): ViewerPhoto[] {
  // A Breakdown photo never changes once stored, so its cache file is keyed by its id alone.
  const sources = useAuthedFileSources(
    breakdown.photos.map((photo) => ({
      cacheDir: 'breakdown-photos',
      cacheName: `${photo.id}.img`,
      path: breakdownPhotoPath(breakdown.id, photo.id),
      label: 'Breakdown photo',
    })),
  );
  return breakdown.photos.map((photo, index) => ({
    key: photo.id,
    label: `Breakdown photo ${formatNumber(index + 1)}`,
    source: sources[index] ?? { kind: 'loading' },
  }));
}
