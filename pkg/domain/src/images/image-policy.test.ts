import { describe, expect, it } from 'vitest';

import { type ImagePolicy, validateImage } from './image-policy.js';

const PNG_HEADER = [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a];
const JPEG_HEADER = [0xff, 0xd8, 0xff];
const PDF_HEADER = [0x25, 0x50, 0x44, 0x46, 0x2d];

const POLICY: ImagePolicy = { allowedContentTypes: ['image/png', 'image/jpeg'], maxBytes: 1024 };

function bytesWithHeader(header: number[], totalLength = header.length): Uint8Array {
  const bytes = new Uint8Array(totalLength);
  bytes.set(header);

  return bytes;
}

describe('validateImage', () => {
  it('accepts a PNG and reports its sniffed content type and size', () => {
    const result = validateImage(bytesWithHeader(PNG_HEADER, 64), POLICY);

    expect(result).toEqual({ ok: true, byteSize: 64, contentType: 'image/png' });
  });

  it('accepts a JPEG', () => {
    const result = validateImage(bytesWithHeader(JPEG_HEADER, 32), POLICY);

    expect(result).toEqual({ ok: true, byteSize: 32, contentType: 'image/jpeg' });
  });

  it('rejects a format outside the policy by sniffing its bytes', () => {
    const result = validateImage(bytesWithHeader(PDF_HEADER, 32), POLICY);

    expect(result).toEqual({
      ok: false,
      code: 'image.content_type_not_allowed',
      message: 'Only PNG or JPEG files can be uploaded.',
    });
  });

  it('accepts a non-image type when the policy allows it', () => {
    const result = validateImage(bytesWithHeader(PDF_HEADER, 48), {
      allowedContentTypes: ['application/pdf'],
      maxBytes: 1024,
    });

    expect(result).toEqual({ ok: true, byteSize: 48, contentType: 'application/pdf' });
  });

  it('describes a non-image policy in its rejection message', () => {
    const result = validateImage(bytesWithHeader(PNG_HEADER, 16), {
      allowedContentTypes: ['application/pdf'],
      maxBytes: 1024,
    });

    expect(result).toEqual({
      ok: false,
      code: 'image.content_type_not_allowed',
      message: 'Only PDF files can be uploaded.',
    });
  });

  it('rejects unrecognized bytes', () => {
    const result = validateImage(new Uint8Array([0x00, 0x01, 0x02, 0x03]), POLICY);

    expect(result).toMatchObject({ ok: false, code: 'image.content_type_not_allowed' });
  });

  it('rejects an image that exceeds the policy size cap', () => {
    const result = validateImage(bytesWithHeader(PNG_HEADER, POLICY.maxBytes + 1), POLICY);

    expect(result).toMatchObject({ ok: false, code: 'image.file_too_large' });
  });

  it('accepts an image at exactly the size cap', () => {
    const result = validateImage(bytesWithHeader(PNG_HEADER, POLICY.maxBytes), POLICY);

    expect(result).toMatchObject({ ok: true });
  });

  it('respects a single-format policy in its rejection message', () => {
    const result = validateImage(bytesWithHeader(JPEG_HEADER, 16), {
      allowedContentTypes: ['image/png'],
      maxBytes: 1024,
    });

    expect(result).toEqual({
      ok: false,
      code: 'image.content_type_not_allowed',
      message: 'Only PNG files can be uploaded.',
    });
  });
});
