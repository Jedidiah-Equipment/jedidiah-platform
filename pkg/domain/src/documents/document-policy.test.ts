import { describe, expect, it } from 'vitest';

import {
  DOCUMENT_JPEG_CONTENT_TYPE,
  DOCUMENT_PDF_CONTENT_TYPE,
  DOCUMENT_PNG_CONTENT_TYPE,
  DOCUMENT_WEBP_CONTENT_TYPE,
  PRODUCT_DOCUMENT_MAX_BYTES,
  sniffDocumentContentType,
  validateDocumentMetadata,
  validateDocumentPolicy,
} from './document-policy.js';

describe('validateDocumentPolicy', () => {
  it('allows product PDFs through the size boundary', () => {
    expect(
      validateDocumentPolicy({
        byteSize: PRODUCT_DOCUMENT_MAX_BYTES,
        contentType: DOCUMENT_PDF_CONTENT_TYPE,
        ownerType: 'product',
      }),
    ).toEqual({ ok: true });
  });

  it('rejects product image documents', () => {
    for (const contentType of [DOCUMENT_PNG_CONTENT_TYPE, DOCUMENT_JPEG_CONTENT_TYPE, DOCUMENT_WEBP_CONTENT_TYPE]) {
      expect(
        validateDocumentPolicy({
          byteSize: 100,
          contentType,
          ownerType: 'product',
        }),
      ).toMatchObject({
        ok: false,
        code: 'document.content_type_not_allowed',
      });
    }
  });

  it('rejects unsupported product documents', () => {
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

  it('allows only PDF content for quote documents', () => {
    expect(
      validateDocumentPolicy({
        byteSize: 100,
        contentType: DOCUMENT_PDF_CONTENT_TYPE,
        ownerType: 'quote',
      }),
    ).toEqual({ ok: true });

    expect(
      validateDocumentPolicy({
        byteSize: 100,
        contentType: DOCUMENT_PNG_CONTENT_TYPE,
        ownerType: 'quote',
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
        contentType: DOCUMENT_PDF_CONTENT_TYPE,
        ownerType: 'product',
      }),
    ).toMatchObject({
      ok: false,
      code: 'document.file_too_large',
    });
  });
});

describe('validateDocumentMetadata', () => {
  it('accepts each valid product document type', () => {
    for (const type of ['sop', 'part_book', 'brochure'] as const) {
      expect(validateDocumentMetadata({ metadata: { type }, ownerType: 'product' })).toEqual({ ok: true });
    }
  });

  it('rejects product metadata with a missing type', () => {
    expect(validateDocumentMetadata({ metadata: {}, ownerType: 'product' })).toMatchObject({
      ok: false,
      code: 'document.metadata_invalid',
    });
    expect(validateDocumentMetadata({ metadata: { type: undefined }, ownerType: 'product' })).toMatchObject({
      ok: false,
      code: 'document.metadata_invalid',
    });
  });

  it('rejects product metadata with an unknown type', () => {
    expect(validateDocumentMetadata({ metadata: { type: 'manual' }, ownerType: 'product' })).toMatchObject({
      ok: false,
      code: 'document.metadata_invalid',
    });
  });

  it('validates quote revision metadata', () => {
    expect(validateDocumentMetadata({ metadata: { revision: 1 }, ownerType: 'quote' })).toEqual({ ok: true });
    expect(validateDocumentMetadata({ metadata: { revision: 0 }, ownerType: 'quote' })).toMatchObject({
      ok: false,
      code: 'document.metadata_invalid',
    });
    expect(validateDocumentMetadata({ metadata: { type: 'part_book' }, ownerType: 'quote' })).toMatchObject({
      ok: false,
      code: 'document.metadata_invalid',
    });
  });
});

describe('sniffDocumentContentType', () => {
  it('returns the verified content type for supported document magic bytes', () => {
    expect(sniffDocumentContentType(new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]))).toBe(
      DOCUMENT_PDF_CONTENT_TYPE,
    );
    expect(sniffDocumentContentType(new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))).toBe(
      DOCUMENT_PNG_CONTENT_TYPE,
    );
    expect(sniffDocumentContentType(new Uint8Array([0xff, 0xd8, 0xff, 0xe0]))).toBe(DOCUMENT_JPEG_CONTENT_TYPE);
    expect(
      sniffDocumentContentType(
        new Uint8Array([0x52, 0x49, 0x46, 0x46, 0x00, 0x00, 0x00, 0x00, 0x57, 0x45, 0x42, 0x50]),
      ),
    ).toBe(DOCUMENT_WEBP_CONTENT_TYPE);
  });

  it('returns null when bytes do not match a supported document type', () => {
    expect(sniffDocumentContentType(new Uint8Array([0x50, 0x4b, 0x03, 0x04]))).toBeNull();
  });
});
