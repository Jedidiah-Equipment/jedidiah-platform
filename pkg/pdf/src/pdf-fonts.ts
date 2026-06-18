import { createRequire } from 'node:module';
import { JEDIDIAH_APP_FONT_FAMILY, JEDIDIAH_PDF_FONT_FACES } from '@pkg/domain';
import { Font } from '@react-pdf/renderer';

const require = createRequire(import.meta.url);

export const pdfFontFamily = JEDIDIAH_APP_FONT_FAMILY;

function fontPath(filename: string): string {
  return require.resolve(`@pkg/domain/fonts/geist-sans/${filename}`);
}

Font.register({
  family: pdfFontFamily,
  fonts: JEDIDIAH_PDF_FONT_FACES.map(({ filename, fontStyle, fontWeight }) => ({
    fontStyle,
    fontWeight,
    src: fontPath(filename),
  })),
});
