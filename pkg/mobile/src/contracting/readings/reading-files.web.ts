// CameraView returns a data URI on web; retaining it in the queue survives reloads.
export async function keepReadingPhoto(uri: string, _localId: string): Promise<string> {
  if (!uri.startsWith('data:')) throw new Error('The camera did not return a persistent photo. Please retake it.');
  return uri;
}
export async function removeReadingPhoto(_uri: string) {}
