import { PRODUCT_IMAGE_SLOT_SPECS, type Product, type ProductImageSlot } from '@pkg/schema';
import type React from 'react';
import { PRODUCT_IMAGE_SLOT_USAGE } from '@/components/catalog/index.js';
import { Card, CardContent, CardDescription, CardHeader, CardSeparator, CardTitle } from '@/components/ui/card.js';
import { useCan } from '@/hooks/use-access.js';
import { ProductImageSlotTile } from './ProductImageSlotTile.js';

type ProductImageSlotField = {
  // The slot-specific intro; the fit sentence is appended from the shared schema spec so the two never drift.
  intro: string;
  label: string;
  slot: ProductImageSlot;
};

// Slot order, labels, and guidance copy for the Images tab. Recommended dimensions and fit come from the
// shared schema specs so the form and renderer stay in lockstep.
const PRODUCT_IMAGE_SLOT_FIELDS: ProductImageSlotField[] = [
  { slot: 'primary', label: 'Primary image', intro: 'Main product photo.' },
  { slot: 'technicalDrawing', label: 'Technical drawing', intro: 'Dimensioned line drawing.' },
  { slot: 'banner', label: 'Banner image', intro: 'Additional product photo.' },
  { slot: 'secondary1', label: 'Secondary image 1', intro: 'Extra product photo for the Lander.' },
  { slot: 'secondary2', label: 'Secondary image 2', intro: 'Extra product photo for the Lander.' },
];

// Composes a slot's guidance line, appending the fit sentence derived from the shared spec so the copy
// always matches how the tile actually renders the image.
function slotDescription({ intro, slot }: ProductImageSlotField): string {
  const fitSentence =
    PRODUCT_IMAGE_SLOT_SPECS[slot].fit === 'cover' ? 'Center-cropped to fill.' : 'Fits without cropping.';
  return `${intro} ${fitSentence}`;
}

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
              description={slotDescription(field)}
              image={product.images[field.slot]}
              key={field.slot}
              label={field.label}
              productId={product.id}
              slot={field.slot}
              usage={PRODUCT_IMAGE_SLOT_USAGE[field.slot]}
            />
          ))}
        </div>
      </CardContent>
    </Card>
  );
};
