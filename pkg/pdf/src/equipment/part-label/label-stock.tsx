import { Page, Path, StyleSheet, Svg, View } from '@react-pdf/renderer';
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

// Label stock drifts about a millimetre as it feeds, so no text sits in the outer 2 mm.
const LABEL_INSET = 2 * POINTS_PER_MILLIMETRE;
export const LABEL_TEXT_WIDTH = LABEL_PAGE_SIZE.width - 2 * LABEL_INSET;

// 2 dots on a 203 dpi head and 3 on a 300 dpi one, so either prints every module without resampling.
const QR_MODULE_WIDTH = 0.25 * POINTS_PER_MILLIMETRE;
const QR_QUIET_ZONE_MODULES = 4;

export type LabelQr = {
  moduleCount: number;
  /** Every dark module as one vector path, in module units from the symbol's top-left corner. */
  path: string;
  /** The printed side in points, quiet zone included. */
  side: number;
};

export function encodeLabelQr(payload: string): LabelQr {
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

  return { moduleCount: size, path, side: (size + 2 * QR_QUIET_ZONE_MODULES) * QR_MODULE_WIDTH };
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: '#FFFFFF',
    color: '#000000',
    fontFamily: pdfFontFamily,
    justifyContent: 'center',
    paddingVertical: 4,
  },
  symbol: {
    alignSelf: 'center',
  },
});

/** One line of label text, inset from the edge and truncated rather than wrapped. */
export const labelLineStyle = {
  maxLines: 1,
  paddingHorizontal: LABEL_INSET,
  textAlign: 'center',
  textOverflow: 'ellipsis',
} as const;

export function LabelPage({ children }: { children: React.ReactNode }) {
  return (
    <Page size={[LABEL_PAGE_SIZE.width, LABEL_PAGE_SIZE.height]} style={styles.page}>
      <View wrap={false}>{children}</View>
    </Page>
  );
}

export function LabelQrSymbol({ payload }: { payload: string }) {
  const symbol = encodeLabelQr(payload);
  const extent = symbol.moduleCount + 2 * QR_QUIET_ZONE_MODULES;

  return (
    <Svg
      height={symbol.side}
      style={styles.symbol}
      viewBox={`${-QR_QUIET_ZONE_MODULES} ${-QR_QUIET_ZONE_MODULES} ${extent} ${extent}`}
      width={symbol.side}
    >
      <Path d={symbol.path} fill="#000000" />
    </Svg>
  );
}
