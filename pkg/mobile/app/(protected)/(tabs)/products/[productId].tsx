import { IconChevronLeft } from '@tabler/icons-react-native';
import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductDetail } from '@/components/products/ProductDetail';
import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import { useTRPC } from '@/lib/trpc';

/** Read-only Product view. The products layout owns the permission gate. */
export default function ProductDetailRoute() {
  const { productId } = useLocalSearchParams<{ productId: string }>();
  const router = useRouter();
  const trpc = useTRPC();
  const query = useQuery(trpc.products.get.queryOptions({ id: productId }));
  const handleBack = () => router.dismissTo('/products');

  return (
    <SafeAreaView className="flex-1 bg-background" edges={['top', 'left', 'right']}>
      {query.isPending ? (
        <RouteMessage text="Loading Product…" />
      ) : query.isError ? (
        <RouteMessage onBack={handleBack} text="Couldn’t load this Product." />
      ) : (
        <ProductDetail onBack={handleBack} product={query.data} />
      )}
    </SafeAreaView>
  );
}

function RouteMessage({ text, onBack }: { text: string; onBack?: () => void }) {
  return (
    <View className="flex-1 items-center justify-center gap-4 px-6">
      <Text className="text-center text-sm text-muted-foreground">{text}</Text>
      {onBack ? (
        <Pressable
          accessibilityRole="button"
          className="flex-row items-center gap-2 rounded-xl border border-border bg-surface px-4 py-2 active:bg-muted"
          onPress={onBack}
        >
          <Icon icon={IconChevronLeft} size={18} />
          <Text className="text-sm text-foreground" weight="semibold">
            Back to Products
          </Text>
        </Pressable>
      ) : null}
    </View>
  );
}
