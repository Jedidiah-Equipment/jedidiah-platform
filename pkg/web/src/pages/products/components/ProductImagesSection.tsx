import type { Product, ProductImageSlot } from '@pkg/schema';
import type React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardSeparator, CardTitle } from '@/components/ui/card.js';
import { useCan } from '@/hooks/use-access.js';
import { ProductImageSlotTile } from './ProductImageSlotTile.js';

type ProductImageSlotField = {
  description: string;
  label: string;
  slot: ProductImageSlot;
};

// Slot order, labels, and guidance copy for the Images tab. Recommended dimensions and fit come from the
// shared schema specs so the form and renderer stay in lockstep.
const PRODUCT_IMAGE_SLOT_FIELDS: ProductImageSlotField[] = [
  { slot: 'primary', label: 'Primary image', description: 'Main product photo. Center-cropped to fill its slot.' },
  {
    slot: 'technicalDrawing',
    label: 'Technical drawing',
    description: 'Dimensioned line drawing. Fits without cropping.',
  },
  { slot: 'banner', label: 'Banner image', description: 'Additional product photo. Center-cropped to fill.' },
  {
    slot: 'secondary1',
    label: 'Secondary image 1',
    description: 'Extra product photo for the Lander. Center-cropped to fill.',
  },
  {
    slot: 'secondary2',
    label: 'Secondary image 2',
    description: 'Extra product photo for the Lander. Center-cropped to fill.',
  },
];

type ProductImagesSectionProps = {
  product: Product;
};

// Standalone Images tab section. Lives outside the autosave `<form>` like {@link ProductDocumentsSection}:
// each tile owns its replace-in-place upload mutation and product-query invalidation, reading the current
// images straight from the persisted Product.
export const ProductImagesSection: React.FC<ProductImagesSectionProps> = ({ product }) => {
  const canEdit = useCan('product:update').can;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Images</CardTitle>
        <CardDescription>
          PNG or JPEG only. Each slot replaces in place, so there is always one current image per slot.
        </CardDescription>
      </CardHeader>
      <CardSeparator />
      <CardContent>
        <div className="grid gap-4 sm:grid-cols-2">
          {PRODUCT_IMAGE_SLOT_FIELDS.map((field) => (
            <ProductImageSlotTile
              canEdit={canEdit}
              description={field.description}
              image={product.images[field.slot]}
              key={field.slot}
              label={field.label}
              productId={product.id}
              slot={field.slot}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
