-- The brochure top-right logo now comes from the owning Product Range's image, not a
-- per-product 'rangeLogo' brochure slot. Drop the now-unused key from existing rows.
UPDATE "products"
SET "brochure_images" = "brochure_images" - 'rangeLogo'
WHERE "brochure_images" ? 'rangeLogo';
