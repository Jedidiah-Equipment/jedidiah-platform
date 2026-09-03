import { describe, expect, it } from 'vitest';

import { canPreviewDocument, getDocumentListAction, getDocumentPlatformType } from './document-content';

describe('document content behavior', () => {
  it('previews PDFs but keeps ZIP files download-only', () => {
    expect(canPreviewDocument('application/pdf')).toBe(true);
    expect(canPreviewDocument('application/zip')).toBe(false);
    expect(getDocumentListAction('application/pdf')).toBe('preview');
    expect(getDocumentListAction('application/zip')).toBe('download');
  });

  it('maps PDF and ZIP files to native sharing types', () => {
    expect(getDocumentPlatformType('application/pdf')).toEqual({
      mimeType: 'application/pdf',
      uti: 'com.adobe.pdf',
    });
    expect(getDocumentPlatformType('application/zip')).toEqual({
      mimeType: 'application/zip',
      uti: 'public.zip-archive',
    });
  });
});
