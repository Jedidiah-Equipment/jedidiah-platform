/** CameraView returns a data URI on web. */
export async function readingPhotoPart(uri: string): Promise<Blob> {
  return (await fetch(uri)).blob();
}
