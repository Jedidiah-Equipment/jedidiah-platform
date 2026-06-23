// Neutral brand placeholder used when a Range or Product has no stored image, so the consumer never
// renders a broken image. Mirrors the prototype's dark thumbnail (yellow skew marks + wordmark) rather
// than fabricating a photo. Served as an SVG so it scales to any card without raster assets.
export const PLACEHOLDER_CONTENT_TYPE = 'image/svg+xml';

export const PLACEHOLDER_SVG = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 640 440" role="img" aria-label="Jedidiah Equipment">
  <rect width="640" height="440" fill="#161616"/>
  <g transform="skewX(-20)">
    <rect x="318" y="150" width="84" height="15" fill="#fff000"/>
    <rect x="318" y="178" width="55" height="15" fill="#fff000"/>
  </g>
  <text x="320" y="262" text-anchor="middle" font-family="'Saira Condensed', system-ui, sans-serif" font-size="46" font-weight="800" font-style="italic" letter-spacing="3" fill="#ffffff">JEDIDIAH</text>
  <text x="320" y="296" text-anchor="middle" font-family="'Barlow', system-ui, sans-serif" font-size="18" font-weight="600" letter-spacing="14" fill="#9a9a9a">EQUIPMENT</text>
</svg>`;
