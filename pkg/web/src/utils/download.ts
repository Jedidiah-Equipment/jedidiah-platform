/**
 * Hands the browser bytes the app already holds. Every download here is a fetch the session cookie
 * authorises, so the file arrives as a blob rather than as an `href` the browser could re-request
 * anonymously — this is what turns that blob back into a saved file.
 *
 * The anchor goes into the document and comes back out: a click on a detached anchor is ignored by
 * some browsers. The revoke waits a tick, because releasing the URL in the same one cancels the
 * download the click just started.
 */
export function saveBlobAsFile({ blob, filename }: { blob: Blob; filename: string }): void {
  const url = URL.createObjectURL(blob);
  const link = window.document.createElement('a');
  link.href = url;
  link.download = filename;
  link.style.display = 'none';
  window.document.body.append(link);

  try {
    link.click();
  } finally {
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 0);
  }
}

/** The same save, for bytes the browser assembles itself — a CSV the app builds in memory. */
export function downloadFile(contents: BlobPart, filename: string, mimeType: string): void {
  saveBlobAsFile({ blob: new Blob([contents], { type: mimeType }), filename });
}
