import { JEDIDIAH_BRAND_YELLOW, JEDIDIAH_BRAND_YELLOW_ON_LIGHT } from '@pkg/domain';

export const pdfColors = {
  black: '#151515',
  border: '#171717',
  darkDivider: '#4a4a4a',
  footerBorder: '#e2e2e2',
  greyBorder: '#dedede',
  muted: '#666666',
  mutedDark: '#333333',
  mutedOnDark: '#EDEDED',
  panel: '#f7f7f7',
  priceCell: '#ededed',
  staleNoticeBackground: '#fff8e5',
  staleNoticeText: '#5f4300',
  white: '#ffffff',
  yellow: JEDIDIAH_BRAND_YELLOW,
  yellowLight: JEDIDIAH_BRAND_YELLOW_ON_LIGHT,
} as const;

export const pdfSpacing = {
  pagePadding: 10,
  section: 6,
  cardPadding: 12,
  tableCellX: 8,
  tableCellY: 8,
  summaryCellX: 10,
  summaryCellY: 9,
} as const;

export const pdfBorder = {
  defaultWidth: 1,
  hairlineWidth: 0.7,
  heavyWidth: 1.2,
} as const;

export const pdfFontSize = {
  eyebrow: 7,
  bodyXs: 8,
  body: 9,
  bodyLg: 10,
  heading: 12,
  title: 18,
} as const;

export const pdfFontWeight = {
  medium: 500,
  semibold: 600,
  bold: 700,
} as const;

export const pdfLineHeight = {
  page: 1.32,
  body: 1.35,
} as const;
