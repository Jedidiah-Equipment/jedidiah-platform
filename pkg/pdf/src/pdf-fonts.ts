import { createRequire } from 'node:module';
import {
  JEDIDIAH_APP_FONT_FAMILY,
  JEDIDIAH_PDF_FONT_FACES,
  JEDIDIAH_PDF_TITLE_FONT_FACES,
  JEDIDIAH_PDF_TITLE_FONT_FAMILY,
} from '@pkg/domain';
import { Font } from '@react-pdf/renderer';

const require = createRequire(import.meta.url);

export const pdfFontFamily = JEDIDIAH_APP_FONT_FAMILY;
export const pdfTitleFontFamily = JEDIDIAH_PDF_TITLE_FONT_FAMILY;

function fontPath(folder: string, filename: string): string {
  return require.resolve(`@pkg/domain/fonts/${folder}/${filename}`);
}

Font.register({
  family: pdfFontFamily,
  fonts: JEDIDIAH_PDF_FONT_FACES.map(({ filename, fontStyle, fontWeight }) => ({
    fontStyle,
    fontWeight,
    src: fontPath('geist-sans', filename),
  })),
});

Font.register({
  family: pdfTitleFontFamily,
  fonts: JEDIDIAH_PDF_TITLE_FONT_FACES.map(({ filename, fontStyle, fontWeight }) => ({
    fontStyle,
    fontWeight,
    src: fontPath('saira-condensed', filename),
  })),
});
