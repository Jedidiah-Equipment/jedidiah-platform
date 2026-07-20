import type { Product, ProductImageSlot } from '@pkg/schema';
import { IconPackage } from '@tabler/icons-react-native';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import type { ProductImageKey } from '@/lib/product-image-cache';
import { useProductImageSource } from '@/lib/product-image-source';

const MOBILE_CARD_IMAGE_SLOTS = [
  'primary',
  'banner',
  'secondary1',
  'secondary2',
] as const satisfies readonly ProductImageSlot[];

type ProductImageProduct = Pick<Product, 'id' | 'images' | 'name'>;

/** Shared authed Product image surface for catalog cards and future detail headers. */
export function ProductImage({ product }: { product: ProductImageProduct }) {
  const slot = MOBILE_CARD_IMAGE_SLOTS.find((candidate) => product.images[candidate] !== null);
  const image = slot ? product.images[slot] : null;

  if (!slot || !image) return <ProductImagePlaceholder />;

  const imageKey = { productId: product.id, slot, updatedAt: image.updatedAt } satisfies ProductImageKey;
  return (
    <ResolvedProductImage
      imageKey={imageKey}
      key={`${imageKey.productId}-${imageKey.slot}-${imageKey.updatedAt}`}
      productName={product.name}
    />
  );
}

function ResolvedProductImage({ productName, imageKey }: { productName: string; imageKey: ProductImageKey }) {
  const source = useProductImageSource(imageKey);
  const [failed, setFailed] = useState(false);

  if (failed || source.kind !== 'ready') return <ProductImagePlaceholder />;

  return (
    <Image
      accessibilityLabel={`${productName} photo`}
      onError={() => setFailed(true)}
      resizeMode="cover"
      source={{ uri: source.uri }}
      style={styles.image}
    />
  );
}

function ProductImagePlaceholder() {
  return (
    <View
      accessibilityLabel="Product image unavailable"
      accessibilityRole="image"
      className="flex-1 items-center justify-center bg-image-backdrop"
    >
      <View className="h-14 w-14 items-center justify-center rounded-2xl border border-primary/30 bg-primary/10">
        <Icon className="text-primary" icon={IconPackage} size={28} strokeWidth={1.6} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Explicit dimensions avoid react-native-web falling back to the image's intrinsic size.
  image: { height: '100%', width: '100%' },
});
