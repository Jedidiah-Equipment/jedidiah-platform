import type { Product, ProductImageSlot } from '@pkg/schema';
import { IconPackage } from '@tabler/icons-react-native';
import { useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { apiBaseUrl } from '@/lib/api-base-url';
import { sessionCookieHeader } from '@/lib/auth';

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
  const imageUrl = slot ? `${apiBaseUrl}/api/products/${encodeURIComponent(product.id)}/images/${slot}/download` : null;

  if (!imageUrl) return <ProductImagePlaceholder />;

  return <ResolvedProductImage imageUrl={imageUrl} key={imageUrl} productName={product.name} />;
}

function ResolvedProductImage({ productName, imageUrl }: { productName: string; imageUrl: string }) {
  const [failed, setFailed] = useState(false);

  if (failed) return <ProductImagePlaceholder />;

  const cookie = sessionCookieHeader();

  return (
    <Image
      accessibilityLabel={`${productName} photo`}
      onError={() => setFailed(true)}
      resizeMode="cover"
      source={{ headers: cookie ? { Cookie: cookie } : undefined, uri: imageUrl }}
      style={StyleSheet.absoluteFill}
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
