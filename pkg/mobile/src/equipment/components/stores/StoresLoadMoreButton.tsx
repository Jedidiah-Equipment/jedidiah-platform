import { Pressable } from 'react-native';

import { Text } from '@/components/ui/text';

/**
 * How every paged list on the stores tablet asks for its next page.
 *
 * Deliberately not styled as a card. It sat inside the list as one more bordered surface, which
 * made it read as another row — the one thing it must not be on a screen where every row is a
 * thing you tap to act on. Primary text on bare background says "control", not "record".
 *
 * It carries no "20 of 82" count. A storeman working a list is looking for one Part, not auditing
 * their progress through it, and the running tally only competed with the Part names either side.
 *
 * Tapping is the only way these lists page (see the count screen): fetching on scroll-end pushes
 * whatever sits below the list further down with every scroll toward it.
 */
export function StoresLoadMoreButton({ isLoading, onPress }: { isLoading: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityLabel="Load more"
      accessibilityRole="button"
      accessibilityState={{ busy: isLoading, disabled: isLoading }}
      className={`items-center px-4 py-4 ${isLoading ? 'opacity-40' : ''}`}
      disabled={isLoading}
      onPress={onPress}
    >
      <Text className="text-base text-primary" weight="semibold">
        {isLoading ? 'Loading…' : 'Load more'}
      </Text>
    </Pressable>
  );
}
