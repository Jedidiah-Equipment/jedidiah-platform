import { DOCUMENT_PDF_CONTENT_TYPE, DOCUMENT_ZIP_CONTENT_TYPE } from '@pkg/domain';

export function canPreviewDocument(contentType: string): boolean {
  return contentType.toLowerCase() === DOCUMENT_PDF_CONTENT_TYPE;
}

export function getDocumentListAction(contentType: string): 'download' | 'preview' {
  return canPreviewDocument(contentType) ? 'preview' : 'download';
}

export function getDocumentPlatformType(contentType: string): { mimeType: string; uti?: string } {
  const normalized = contentType.toLowerCase();

  if (normalized === DOCUMENT_PDF_CONTENT_TYPE) {
    return { mimeType: DOCUMENT_PDF_CONTENT_TYPE, uti: 'com.adobe.pdf' };
  }

  if (normalized === DOCUMENT_ZIP_CONTENT_TYPE) {
    return { mimeType: DOCUMENT_ZIP_CONTENT_TYPE, uti: 'public.zip-archive' };
  }

  return { mimeType: contentType };
}
