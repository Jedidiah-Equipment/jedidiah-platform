import { formatNumber } from '@pkg/domain';
import { IconCamera, IconPhoto, IconX } from '@tabler/icons-react-native';
import { Image, Pressable, ScrollView, View } from 'react-native';
import { Button } from '@/components/ui/button';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';

export const GALLERY_HINT = 'Photo kept in the app; allow photo library access to see it in your gallery.';

/** The note's photos with Take photo and Choose from gallery; `uri` here is already displayable. */
export function FieldNotePhotoStrip({
  photos,
  limit,
  busy,
  galleryHint,
  onTake,
  onChoose,
  onRemove,
  noun = 'Field Note photo',
}: {
  noun?: string;
  photos: readonly { id: string; uri: string }[];
  limit: number;
  busy: boolean;
  galleryHint: boolean;
  onTake: () => void;
  onChoose: () => void;
  onRemove: (photoId: string) => void;
}) {
  const full = photos.length >= limit;
  return (
    <View className="gap-3">
      <View className="flex-row items-baseline justify-between">
        <Text className="text-foreground" weight="semibold">
          Photos
        </Text>
        <Text className="text-sm text-muted-foreground">
          {formatNumber(photos.length)} of {formatNumber(limit)}
        </Text>
      </View>
      {photos.length ? (
        <ScrollView horizontal contentContainerStyle={{ gap: 8 }} showsHorizontalScrollIndicator={false}>
          {photos.map((photo, index) => (
            <View key={photo.id} className="h-28 w-28 overflow-hidden rounded-xl bg-image-backdrop">
              <Image
                accessibilityLabel={`${noun} ${formatNumber(index + 1)}`}
                source={{ uri: photo.uri }}
                className="h-full w-full"
                resizeMode="cover"
              />
              <Pressable
                accessibilityLabel={`Remove photo ${formatNumber(index + 1)}`}
                accessibilityRole="button"
                disabled={busy}
                onPress={() => onRemove(photo.id)}
                className="absolute right-1 top-1 h-8 w-8 items-center justify-center rounded-full bg-black/60"
              >
                <Icon className="text-white" icon={IconX} size={16} />
              </Pressable>
            </View>
          ))}
        </ScrollView>
      ) : null}
      {galleryHint ? <Text className="text-sm text-muted-foreground">{GALLERY_HINT}</Text> : null}
      <Button title="Take photo" icon={IconCamera} disabled={busy || full} onPress={onTake} />
      <Button title="Choose from gallery" icon={IconPhoto} disabled={busy || full} onPress={onChoose} />
    </View>
  );
}
