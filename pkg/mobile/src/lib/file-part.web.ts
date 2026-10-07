/** The web pickers hand back data or blob URIs, which the browser reads into a part itself. */
export async function filePart(uri: string, _missingMessage: string): Promise<Blob> {
  return (await fetch(uri)).blob();
}
