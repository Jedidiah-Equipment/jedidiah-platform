import type { FieldNoteFiles } from './store';

export const GALLERY_ALBUM = 'Jedidiah';

/** The web preview keeps each photo as a data URI inside the note itself, so localStorage caps it at two. */
export const fieldNoteFiles: FieldNoteFiles = {
  photoLimit: 2,
  async keep(sourceUri) {
    if (!sourceUri.startsWith('data:')) throw new Error('The picker did not return a photo that can be kept.');
    return { uri: sourceUri, inGallery: true };
  },
  async removePhoto() {},
  async removeNote() {},
};

export function resolveFieldNotePhotoUri(uri: string): string {
  return uri;
}
