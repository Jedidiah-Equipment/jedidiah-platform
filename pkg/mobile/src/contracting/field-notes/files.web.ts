import type { FieldNoteFiles } from './store';

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

/** The browser has no photo library to add to. */
export async function saveToGallery(_uri: string) {}
