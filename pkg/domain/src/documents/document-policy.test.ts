import { describe, expect, it } from 'vitest';

import { PRODUCT_DOCUMENT_MAX_BYTES, validateDocumentPolicy } from './document-policy.js';

describe('validateDocumentPolicy', () => {
  it('allows product PDFs through the size boundary', () => {
    expect(
      validateDocumentPolicy({
        byteSize: PRODUCT_DOCUMENT_MAX_BYTES,
        contentType: 'application/pdf',
        ownerType: 'product',
      }),
    ).toEqual({ ok: true });
  });

  it('rejects non-PDF product documents', () => {
    expect(
      validateDocumentPolicy({
        byteSize: 100,
        contentType: 'text/plain',
        ownerType: 'product',
      }),
    ).toMatchObject({
      ok: false,
      code: 'document.content_type_not_allowed',
    });
  });

  it('rejects product documents over the size cap', () => {
    expect(
      validateDocumentPolicy({
        byteSize: PRODUCT_DOCUMENT_MAX_BYTES + 1,
        contentType: 'application/pdf',
        ownerType: 'product',
      }),
    ).toMatchObject({
      ok: false,
      code: 'document.file_too_large',
    });
  });
});
