import { PART_CODE_MAX_LENGTH, type PartLabelPdfModel } from '@pkg/schema/equipment';
import { Font } from '@react-pdf/renderer';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, test } from 'vitest';

import { getPdfPageSizes } from '../../bytes/pdf-bytes.js';
import { pdfFontFamily } from '../../pdf-fonts.js';
import {
  breakColumnWord,
  LABEL_INSET,
  LABEL_PAGE_SIZE,
  LABEL_PRINTER_DOT,
  LABEL_TEXT_WIDTH,
  layoutLabel,
  QR_QUIET_ZONE_MODULES,
} from './label-stock.js';
import { PART_LABEL_CODE_STYLE, PartLabelPdf } from './PartLabelPdf.js';
import { renderPartLabelsPdf } from './part-label-pdf-renderer.js';

const POINTS_PER_MILLIMETRE = 72 / 25.4;
// Layout is float arithmetic in points; a boundary that lands exactly on a limit may miss it by rounding.
const EPSILON = 1e-9;

const LABELS = [
  { code: 'P-100', name: 'Main bearing', storageLocation: 'Bin A-04' },
  { code: 'PIPE-042', name: 'Hydraulic pipe', storageLocation: null },
] satisfies PartLabelPdfModel[];

describe('Part label PDF', () => {
  test('draws a standard, unmirrored QR symbol at error correction M or better', () => {
    const symbol = layoutLabel('P-100', PART_LABEL_CODE_STYLE);
    const dark = darkModules(symbol.path);
    const version = (symbol.moduleCount - 17) / 4;

    expect(symbol.moduleCount).toBe(21);
    // ISO/IEC 18004: the module at (4V + 9, 8) is always dark, and the format information is a valid
    // BCH codeword naming the error correction level. A mirrored symbol fails both.
    expect(dark.has(`${4 * version + 9},8`)).toBe(true);
    expect(['M', 'Q', 'H']).toContain(readFormatErrorCorrection(dark));
  });

  test('prints a typed Part code at 0.75 mm modules, the largest whole-dot module the label holds', () => {
    const symbol = layoutLabel('SKF-UCF212-60', PART_LABEL_CODE_STYLE);

    expect(symbol.moduleCount).toBe(21);
    expect(symbol.moduleWidth).toBeCloseTo(0.75 * POINTS_PER_MILLIMETRE, 3);
    expect(symbol.symbol.width).toBeCloseTo(15.75 * POINTS_PER_MILLIMETRE, 3);
  });

  test.each([
    ['a typed Part code', 'SKF-UCF212-60'],
    ['a legacy code past 42 characters', 'Grade 80 chain short link 20mm Apex 80 galvanised'],
  ])('keeps a quiet zone round %s, clear of the feed drift, the column, and the code line', (_, payload) => {
    const { column, footerTop, moduleWidth, symbol } = layoutLabel(payload, PART_LABEL_CODE_STYLE);
    const quietZone = QR_QUIET_ZONE_MODULES * moduleWidth;
    const clearance = Math.max(LABEL_INSET, quietZone);
    const dots = moduleWidth / LABEL_PRINTER_DOT;

    expect(dots).toBeCloseTo(Math.round(dots), 6);
    expect(Math.round(dots)).toBeGreaterThanOrEqual(2);
    expect(symbol.left).toBeGreaterThanOrEqual(clearance - EPSILON);
    expect(symbol.top).toBeGreaterThanOrEqual(clearance - EPSILON);
    expect(footerTop - (symbol.top + symbol.height)).toBeGreaterThanOrEqual(quietZone - EPSILON);
    expect(column.left - (symbol.left + symbol.width)).toBeGreaterThanOrEqual(quietZone - EPSILON);
    expect(column.left + column.width).toBeLessThanOrEqual(LABEL_PAGE_SIZE.width - LABEL_INSET + EPSILON);
  });

  test('shrinks the modules rather than outgrow the label when a legacy code needs a bigger symbol', () => {
    const symbol = layoutLabel('Grade 80 chain short link 20mm Apex 80 galvanised', PART_LABEL_CODE_STYLE);

    expect(symbol.moduleCount).toBe(33);
    expect(symbol.moduleWidth).toBeCloseTo(0.5 * POINTS_PER_MILLIMETRE, 3);
  });

  test('keeps a column word whole while it fits the column, and breaks only a word wider than it', async () => {
    await Font.getFont({ fontFamily: pdfFontFamily, fontWeight: 400 })?.load();
    const columnWidth = 16 * POINTS_PER_MILLIMETRE;

    expect(breakColumnWord('Stainless', { fontSize: 7 }, columnWidth)).toEqual(['Stainless']);
    expect(breakColumnWord('Hydraulicmotorcoupling', { fontSize: 7 }, columnWidth)).toEqual([
      ...'Hydraulicmotorcoupling',
    ]);
  });

  test('fits the longest Part code a label carries on one code line, and not one character more', async () => {
    const font = Font.getFont({ fontFamily: PART_LABEL_CODE_STYLE.fontFamily, fontWeight: 700 });
    await font?.load();
    // Capitals as wide as H, the run of a typical uppercase-and-digit code. M and W are wider, so a code
    // heavy in them truncates with an ellipsis; the QR code still carries it whole.
    const lineWidth = (length: number) =>
      length *
      (((font?.data?.layout('H').advanceWidth ?? Number.NaN) / (font?.data?.unitsPerEm ?? 1)) *
        PART_LABEL_CODE_STYLE.fontSize +
        PART_LABEL_CODE_STYLE.letterSpacing);

    expect(lineWidth(PART_CODE_MAX_LENGTH)).toBeLessThanOrEqual(LABEL_TEXT_WIDTH);
    expect(lineWidth(PART_CODE_MAX_LENGTH + 1)).toBeGreaterThan(LABEL_TEXT_WIDTH);
  });

  test('prints the Part code, name, and storage location with a fallback', () => {
    const text = collectText(PartLabelPdf({ labels: LABELS }));

    expect(text).toEqual(expect.arrayContaining(['P-100', 'Main bearing', 'Bin A-04', 'PIPE-042', 'Hydraulic pipe']));
    expect(text.filter((value) => value === 'Location not set')).toHaveLength(1);
  });

  test('renders one 40 by 30 millimetre page per Part, the stock itself, so it prints at 100%', async () => {
    const bytes = await renderPartLabelsPdf({ document: LABELS, filename: 'part-labels.pdf' });
    const pageSizes = await getPdfPageSizes(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(pageSizes).toHaveLength(2);
    for (const page of pageSizes) {
      expect(page.width).toBeCloseTo(40 * POINTS_PER_MILLIMETRE, 3);
      expect(page.height).toBeCloseTo(30 * POINTS_PER_MILLIMETRE, 3);
    }
  });

  test('keeps the longest codes and unbounded readable fields on one physical label page each', async () => {
    const repeated = 'Long label content '.repeat(12);
    const bytes = await renderPartLabelsPdf({
      document: [
        { code: 'Grade 80 chain short link 20mm Apex 80', name: repeated, storageLocation: repeated },
        { code: 'Grade 80 chain short link 20mm Apex 80 galvanised', name: repeated, storageLocation: repeated },
      ],
      filename: 'long-part-label.pdf',
    });

    expect(await getPdfPageSizes(bytes)).toHaveLength(2);
  });
});

function darkModules(path: string): Set<string> {
  const dark = new Set<string>();
  for (const [, col, row, run] of path.matchAll(/M(\d+) (\d+)h(\d+)/g)) {
    for (let offset = 0; offset < Number(run); offset++) dark.add(`${row},${Number(col) + offset}`);
  }
  return dark;
}

// ISO/IEC 18004 format information: a BCH(15,5) codeword over this generator, XORed with this mask.
const FORMAT_BCH_GENERATOR = 0x537;
const FORMAT_MASK = 0x5412;

/** Reads the top-left copy of the format information and returns its error correction level. */
function readFormatErrorCorrection(dark: Set<string>): string | undefined {
  const positions: Array<[number, number]> = [
    ...[0, 1, 2, 3, 4, 5].map((row): [number, number] => [row, 8]),
    [7, 8],
    [8, 8],
    [8, 7],
    ...[5, 4, 3, 2, 1, 0].map((col): [number, number] => [8, col]),
  ];
  const bits = positions.reduce((word, [row, col], bit) => (dark.has(`${row},${col}`) ? word | (1 << bit) : word), 0);

  for (const [level, levelBits] of [
    ['L', 1],
    ['M', 0],
    ['Q', 3],
    ['H', 2],
  ] as const) {
    for (let mask = 0; mask < 8; mask++) {
      const data = (levelBits << 3) | mask;
      let remainder = data;
      for (let step = 0; step < 10; step++) remainder = (remainder << 1) ^ ((remainder >>> 9) * FORMAT_BCH_GENERATOR);
      if ((((data << 10) | remainder) ^ FORMAT_MASK) === bits) return level;
    }
  }
  return undefined;
}

type RenderedElement = ReactElement<{ children?: ReactNode }>;

function collectText(node: ReactNode): string[] {
  if (node === null || node === undefined || typeof node === 'boolean') return [];
  if (typeof node === 'string' || typeof node === 'number') return [String(node)];
  if (Array.isArray(node)) return node.flatMap(collectText);
  if (!isValidElement(node)) return [];
  const element = node as RenderedElement;
  if (typeof element.type === 'function') {
    return collectText((element.type as (props: typeof element.props) => ReactNode)(element.props));
  }
  return collectText(element.props.children);
}
