import { useState } from 'react';
import { Image, View } from 'react-native';

import { Text } from './ui/text';

/** Up to two initials from a name, for the image-less fallback. */
function initials(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  const first = parts.at(0)?.charAt(0) ?? '';
  const last = parts.length > 1 ? (parts.at(-1)?.charAt(0) ?? '') : '';

  return (first + last).toUpperCase() || '?';
}

/**
 * Image-or-initials avatar shared by the manager, Bay operators, and product
 * thumbnails. `uri` accepts an http(s) URL or an inline data URL (operator and
 * product thumbnails ride the API payload as data URLs); a missing or broken
 * image falls back to initials on a muted tile.
 */
export function Avatar({
  uri,
  name,
  className = '',
  textClassName = 'text-xs',
}: {
  uri: string | null | undefined;
  name: string;
  /** Size + shape utilities, e.g. `h-10 w-10 rounded-full`. */
  className?: string;
  textClassName?: string;
}) {
  const [failed, setFailed] = useState(false);
  const showImage = uri && !failed;

  return (
    <View className={`items-center justify-center overflow-hidden border border-border bg-muted ${className}`}>
      {showImage ? (
        <Image
          accessibilityIgnoresInvertColors
          className="h-full w-full"
          onError={() => setFailed(true)}
          resizeMode="cover"
          source={{ uri }}
        />
      ) : (
        <Text className={`text-muted-foreground ${textClassName}`} weight="semibold">
          {initials(name)}
        </Text>
      )}
    </View>
  );
}
