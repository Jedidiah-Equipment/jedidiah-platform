import { quoteKindColorClassNames } from '@pkg/domain/equipment';
import type { Product, ProductImageSlot } from '@pkg/schema/equipment';
import { IconPackage } from '@tabler/icons-react-native';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { ImageViewer } from '@/components/ImageViewer';
import { Icon } from '@/components/ui/icon';
import type { ProductImageKey } from '@/equipment/lib/product-image-cache';
import { useProductImageSource } from '@/equipment/lib/product-image-source';
import { useColorMode } from '@/theme/use-color-mode';

const MOBILE_CARD_IMAGE_SLOTS = [
  'primary',
  'banner',
  'secondary1',
  'secondary2',
] as const satisfies readonly ProductImageSlot[];

type ProductImageProduct = Pick<Product, 'id' | 'images' | 'name'>;

/** Shared authed Product image surface for catalog cards and future detail headers. */
export function ProductImage({ product }: { product: ProductImageProduct }) {
  const imageKey = productImageKey(product);
  if (!imageKey) return <ProductImagePlaceholder />;

  return (
    <ResolvedProductImage
      imageKey={imageKey}
      key={`${imageKey.productId}-${imageKey.slot}-${imageKey.updatedAt}`}
      productName={product.name}
    />
  );
}

/** The photo {@link ProductImage} shows, or `null` when the Product has none. */
export function productImageKey(product: ProductImageProduct): ProductImageKey | null {
  const slot = MOBILE_CARD_IMAGE_SLOTS.find((candidate) => product.images[candidate] !== null);
  const image = slot ? product.images[slot] : null;
  return slot && image ? { productId: product.id, slot, updatedAt: image.updatedAt } : null;
}

/** {@link ProductImage}'s photo in the full-screen viewer. */
export function ProductImageViewer({
  imageKey,
  onClose,
  productName,
}: {
  imageKey: ProductImageKey;
  onClose: () => void;
  productName: string;
}) {
  const source = useProductImageSource(imageKey);
  return (
    <ImageViewer index={0} photos={[{ key: 'product', label: `${productName} photo`, source }]} onClose={onClose} />
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

/**
 * Stands in for a Product with no photo. It reads the same offering-kind palette web's
 * `OfferingThumbnail` paints a Product with, rather than the `primary` token — which is brand chrome,
 * and turns pink on staging.
 */
function ProductImagePlaceholder() {
  const { chip, textByScheme } = quoteKindColorClassNames.product;
  const { resolved } = useColorMode();

  return (
    <View
      accessibilityLabel="Product image unavailable"
      accessibilityRole="image"
      className="flex-1 items-center justify-center bg-image-backdrop"
    >
      <View className={`h-14 w-14 items-center justify-center rounded-2xl border ${chip}`}>
        <Icon className={textByScheme[resolved]} icon={IconPackage} size={28} strokeWidth={1.6} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  // Explicit dimensions avoid react-native-web falling back to the image's intrinsic size.
  image: { height: '100%', width: '100%' },
});
