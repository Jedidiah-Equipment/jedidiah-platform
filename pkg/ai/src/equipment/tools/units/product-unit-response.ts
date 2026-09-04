import { ProductUnitSummary } from '@pkg/schema/equipment';

/**
 * The Product as the assistant sees it. The thumbnail rides both Unit reads as an inline data URL for
 * the app's own surfaces, and is worth up to 64 KB of base64 per Unit in a tool result nothing can
 * render, so it is dropped here rather than at each call site.
 */
export const ProductUnitProductResponse = ProductUnitSummary.shape.product.omit({ thumbnailDataUrl: true });
