// Neutral brand placeholder used when a Range or Product has no stored image, so the consumer never
// renders a broken image. Centres the white Jedidiah mark on a dark card rather than fabricating a photo.
// Served as an SVG so it scales to any card; the mark is inlined as a data URI because browsers do not load
// external resources from an SVG referenced via <img>.
import markWhiteDataUri from '@pkg/domain/assets/brand/jedidiah-mark-white.png?inline';

export const PLACEHOLDER_CONTENT_TYPE = 'image/svg+xml';

// Mark is 583×768 (portrait); keep that aspect and centre it on the 640×440 card.
const MARK_HEIGHT = 168;
const MARK_WIDTH = Math.round(MARK_HEIGHT * (583 / 768));
const MARK_X = Math.round((640 - MARK_WIDTH) / 2);
const MARK_Y = Math.round((440 - MARK_HEIGHT) / 2);

export const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 440" role="img" aria-label="Jedidiah Equipment">
  <rect width="640" height="440" fill="#161616"/>
  <image href="${markWhiteDataUri}" x="${MARK_X}" y="${MARK_Y}" width="${MARK_WIDTH}" height="${MARK_HEIGHT}"/>
</svg>`;
