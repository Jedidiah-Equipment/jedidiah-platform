import type { PartLabelPdfModel } from '@pkg/schema';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, test } from 'vitest';

import { getPdfPageSizes } from '../bytes/pdf-bytes.js';
import { getCode128BarPattern } from './code128.js';
import { PART_LABEL_PAGE_SIZE, PartLabelPdf } from './PartLabelPdf.js';
import { renderPartLabelsPdf } from './part-label-pdf-renderer.js';

const LABELS = [
  { code: 'P-100', name: 'Main bearing', storageLocation: 'Bin A-04' },
  { code: 'PIPE-042', name: 'Hydraulic pipe', storageLocation: null },
] satisfies PartLabelPdfModel[];

describe('Part label PDF', () => {
  test('encodes a known Part code as the expected Code 128 bar pattern', () => {
    expect(getCode128BarPattern('P-100')).toBe('2112143131211221321232211231221231221114222331112');
  });

  test('prints the Part code, name, and storage location with a fallback', () => {
    const text = collectText(
      PartLabelPdf({
        items: LABELS.map((label, index) => ({ barcodeDataUri: index === 0 ? 'first' : 'second', label })),
      }),
    );

    expect(text).toEqual(expect.arrayContaining(['P-100', 'Main bearing', 'Bin A-04', 'PIPE-042', 'Hydraulic pipe']));
    expect(text.filter((value) => value === 'Location not set')).toHaveLength(1);
  });

  test('renders one 100 by 50 millimetre page per Part', async () => {
    const bytes = await renderPartLabelsPdf({ document: LABELS, filename: 'part-labels.pdf' });
    const pageSizes = await getPdfPageSizes(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(pageSizes).toHaveLength(2);
    for (const page of pageSizes) {
      expect(page.width).toBeCloseTo(PART_LABEL_PAGE_SIZE.width, 3);
      expect(page.height).toBeCloseTo(PART_LABEL_PAGE_SIZE.height, 3);
    }
  });
});

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
