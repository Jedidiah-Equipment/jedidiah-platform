import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { ImageUploadControl, type ImageUploadControlProps } from './ImageUploadControl.js';

const BASE_PROPS: ImageUploadControlProps = {
  accept: 'image/png',
  errorFallbackMessage: 'Unable to process thumbnail.',
  fallbackLabel: 'Customer name',
  inputId: 'thumbnail-input',
  onChange: vi.fn(),
  removeLabel: 'Remove thumbnail',
  replaceLabel: 'Replace thumbnail',
  transform: vi.fn(),
  trigger: 'thumbnail',
  uploadLabel: 'Upload thumbnail',
  value: null,
};

describe('ImageUploadControl', () => {
  it('uses the thumbnail itself as the upload button', () => {
    const html = renderToStaticMarkup(<ImageUploadControl {...BASE_PROPS} />);

    expect(html).toContain('aria-label="Upload thumbnail"');
    expect(html).toContain('data-slot="avatar"');
    expect(html).not.toContain('>Upload<');
  });

  it('preserves the separate upload button for non-thumbnail images', () => {
    const html = renderToStaticMarkup(<ImageUploadControl {...BASE_PROPS} trigger="button" />);

    expect(html).toContain('data-slot="avatar"');
    expect(html).toContain('gap-3');
    expect(html).toContain('flex-wrap');
    expect(html).toContain('>Upload thumbnail<');
  });

  it('uses the image as the replace button while preserving the remove action', () => {
    const html = renderToStaticMarkup(<ImageUploadControl {...BASE_PROPS} value="data:image/png;base64,YQ==" />);

    expect(html).toContain('aria-label="Replace thumbnail"');
    expect(html).toContain('Remove thumbnail');
    expect(html).not.toContain('>Replace<');
  });
});
