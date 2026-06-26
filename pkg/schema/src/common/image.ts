// The set of image formats the platform renders and accepts. Entities that store images pass this into
// their upload policy; the client-side accept attribute and pre-upload guards read it too. The stored
// file read-view itself is content-type agnostic — see {@link EntityFile} in `file.ts`.

// Raster formats the platform renders and accepts. Vector/animated formats are intentionally excluded.
export const IMAGE_CONTENT_TYPES = ['image/png', 'image/jpeg'] as const;
