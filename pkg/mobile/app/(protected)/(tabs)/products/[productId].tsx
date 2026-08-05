import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ProductDetail } from '@/components/products/ProductDetail';
import { ProductImage } from '@/components/products/ProductImage';
import { SecondaryPageToolbar } from '@/components/TopToolbar';
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
      <SecondaryPageToolbar
        avatar={query.data ? <ProductImage product={query.data} /> : undefined}
        onBack={handleBack}
        parentLabel="Products"
        subtitle={query.isPending ? 'LOADING PRODUCT…' : query.isError ? 'PRODUCT UNAVAILABLE' : query.data.modelCode}
        title={query.data?.name ?? 'Product'}
      />
      {query.isPending ? (
        <RouteMessage text="Loading Product…" />
      ) : query.isError ? (
        <RouteMessage text="Couldn’t load this Product." />
      ) : (
        <ProductDetail product={query.data} />
      )}
    </SafeAreaView>
  );
}

function RouteMessage({ text }: { text: string }) {
  return (
    <View className="flex-1 items-center justify-center px-6">
      <Text className="text-center text-sm text-muted-foreground">{text}</Text>
    </View>
  );
}
