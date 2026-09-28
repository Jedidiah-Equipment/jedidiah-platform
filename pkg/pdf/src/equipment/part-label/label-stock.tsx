import { Page, Path, StyleSheet, type Styles, Svg, Text, View } from '@react-pdf/renderer';
import bwipjs from 'bwip-js';
import type React from 'react';

import { pdfFontFamily } from '../../pdf-fonts.js';

const POINTS_PER_MILLIMETRE = 72 / 25.4;

/**
 * The 40 × 30 mm stock Part labels and stores badge cards both print on. The page is the stock, so a
 * print at 100% needs no scaling; a scaled QR code shrinks past what the head prints cleanly.
 */
export const LABEL_PAGE_SIZE = {
  height: 30 * POINTS_PER_MILLIMETRE,
  width: 40 * POINTS_PER_MILLIMETRE,
} as const;

// Label stock drifts about a millimetre as it feeds, so nothing prints in the outer 2 mm.
export const LABEL_INSET = 2 * POINTS_PER_MILLIMETRE;
export const LABEL_TEXT_WIDTH = LABEL_PAGE_SIZE.width - 2 * LABEL_INSET;

// A module is a whole number of dots on the 203 dpi head or its edges print unevenly
// (docs/notes/stores-label-hardware.md). Two dots is the floor when nothing bigger fits.
export const LABEL_PRINTER_DOT = 0.125 * POINTS_PER_MILLIMETRE;
const QR_MIN_MODULE_DOTS = 2;
export const QR_QUIET_ZONE_MODULES = 4;
// Narrow enough to give the symbol the width, wide enough to hold a word of the column text per line.
const LABEL_COLUMN_MIN_WIDTH = 12 * POINTS_PER_MILLIMETRE;

/** The full-width line under the symbol; its height is what the symbol leaves room for. */
type LabelFooterStyle = { fontSize: number; lineHeight: number };

type Box = { height: number; left: number; top: number; width: number };

type LabelLayout = {
  moduleCount: number;
  moduleWidth: number;
  /** Every dark module as one vector path, in module units from the symbol's top-left corner. */
  path: string;
  /** The symbol's dark area, quiet zone excluded, in points from the page's top-left corner. */
  symbol: Box;
  column: Box;
  footerTop: number;
};

/**
 * The largest whole-dot module whose quiet zone stays on the label, clear of the column and the footer;
 * the dark modules never come within the feed-drift inset.
 */
export function layoutLabel(payload: string, footer: LabelFooterStyle): LabelLayout {
  const { moduleCount, path } = encodeQr(payload);
  const footerTop = LABEL_PAGE_SIZE.height - LABEL_INSET - footer.fontSize * footer.lineHeight;
  const edgeFor = (moduleWidth: number) => Math.max(LABEL_INSET, QR_QUIET_ZONE_MODULES * moduleWidth);
  const fits = (moduleWidth: number) => {
    const reach = edgeFor(moduleWidth) + (moduleCount + QR_QUIET_ZONE_MODULES) * moduleWidth;
    return reach <= footerTop && reach + LABEL_COLUMN_MIN_WIDTH + LABEL_INSET <= LABEL_PAGE_SIZE.width;
  };

  let dots = QR_MIN_MODULE_DOTS;
  while (fits((dots + 1) * LABEL_PRINTER_DOT)) dots++;

  const moduleWidth = dots * LABEL_PRINTER_DOT;
  const quietZone = QR_QUIET_ZONE_MODULES * moduleWidth;
  const edge = edgeFor(moduleWidth);
  const side = moduleCount * moduleWidth;
  const band = footerTop - quietZone - edge;
  const columnLeft = edge + side + quietZone;

  return {
    column: {
      height: footerTop - quietZone - LABEL_INSET,
      left: columnLeft,
      top: LABEL_INSET,
      width: LABEL_PAGE_SIZE.width - LABEL_INSET - columnLeft,
    },
    footerTop,
    moduleCount,
    moduleWidth,
    path,
    symbol: { height: side, left: edge, top: edge + Math.max(0, (band - side) / 2), width: side },
  };
}

function encodeQr(payload: string): { moduleCount: number; path: string } {
  const [matrix] = bwipjs.raw('qrcode', payload, 'eclevel=M');

  if (!matrix || !('pixs' in matrix)) {
    throw new Error('QR encoder did not return a module matrix');
  }

  const size = matrix.pixx;
  const isDark = (row: number, col: number) => matrix.pixs[row * size + col] === 1;
  let path = '';

  for (let row = 0; row < size; row++) {
    let col = 0;
    while (col < size) {
      if (!isDark(row, col)) {
        col++;
        continue;
      }
      const start = col;
      while (col < size && isDark(row, col)) col++;
      path += `M${start} ${row}h${col - start}v1h${start - col}z`;
    }
  }

  return { moduleCount: size, path };
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    color: '#000000',
    fontFamily: pdfFontFamily,
  },
  footer: {
    left: 0,
    position: 'absolute',
    right: 0,
  },
  columnText: {
    textOverflow: 'ellipsis',
  },
});

// React-PDF's default hyphenation splits words the narrow column could carry whole onto the next line;
// only a word too long for any line may break, and then anywhere.
const COLUMN_UNBREAKABLE_WORD_LENGTH = 8;
const keepWordsWhole = (word: string) => (word.length > COLUMN_UNBREAKABLE_WORD_LENGTH ? [...word] : [word]);

/** Text in the column beside the symbol: whole words, cut short with an ellipsis after `maxLines`. */
export function LabelColumnText({ children, style }: { children: React.ReactNode; style: Styles[string] }) {
  return (
    <Text hyphenationCallback={keepWordsWhole} style={[styles.columnText, style]}>
      {children}
    </Text>
  );
}

/** One line of label text, inset from the edge and truncated rather than wrapped. */
const labelLineStyle = {
  maxLines: 1,
  paddingHorizontal: LABEL_INSET,
  textAlign: 'center',
  textOverflow: 'ellipsis',
} as const;

/** `children` go in the column beside the symbol. */
export function LabelPage({
  children,
  footer,
  payload,
}: {
  children: React.ReactNode;
  footer: { style: LabelFooterStyle & Styles[string]; text: string };
  payload: string;
}) {
  const layout = layoutLabel(payload, footer.style);
  const { symbol, column } = layout;

  return (
    <Page size={[LABEL_PAGE_SIZE.width, LABEL_PAGE_SIZE.height]} style={styles.page}>
      <View style={{ left: symbol.left, position: 'absolute', top: symbol.top }}>
        <Svg height={symbol.height} viewBox={`0 0 ${layout.moduleCount} ${layout.moduleCount}`} width={symbol.width}>
          <Path d={layout.path} fill="#000000" />
        </Svg>
      </View>
      <View
        style={{
          height: column.height,
          justifyContent: 'center',
          left: column.left,
          overflow: 'hidden',
          position: 'absolute',
          top: column.top,
          width: column.width,
        }}
      >
        {children}
      </View>
      <Text style={[labelLineStyle, footer.style, styles.footer, { top: layout.footerTop }]}>{footer.text}</Text>
    </Page>
  );
}
