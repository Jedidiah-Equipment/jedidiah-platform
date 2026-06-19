export const JEDIDIAH_APP_FONT_FAMILY = 'Geist';
export const JEDIDIAH_PDF_TITLE_FONT_FAMILY = 'Saira Condensed';

export type JedidiahPdfFontFace = {
  filename: string;
  fontStyle: 'italic' | 'normal';
  fontWeight: number;
};

export const JEDIDIAH_PDF_FONT_FACES = [
  { filename: 'Geist-Regular.ttf', fontStyle: 'normal', fontWeight: 400 },
  { filename: 'Geist-Medium.ttf', fontStyle: 'normal', fontWeight: 500 },
  { filename: 'Geist-SemiBold.ttf', fontStyle: 'normal', fontWeight: 600 },
  { filename: 'Geist-Bold.ttf', fontStyle: 'normal', fontWeight: 700 },
  { filename: 'Geist-Italic.ttf', fontStyle: 'italic', fontWeight: 400 },
  { filename: 'Geist-BoldItalic.ttf', fontStyle: 'italic', fontWeight: 700 },
] as const satisfies readonly JedidiahPdfFontFace[];

export const JEDIDIAH_PDF_TITLE_FONT_FACES = [
  { filename: 'SairaCondensed-SemiBold.ttf', fontStyle: 'normal', fontWeight: 600 },
  { filename: 'SairaCondensed-Bold.ttf', fontStyle: 'normal', fontWeight: 700 },
] as const satisfies readonly JedidiahPdfFontFace[];
