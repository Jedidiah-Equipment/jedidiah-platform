import { parseScanToken } from '@pkg/domain/equipment';
import type { UserBadgePdfModel } from '@pkg/schema/equipment';
import { type ComponentProps, isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, test } from 'vitest';

import { getPdfPageSizes } from '../../bytes/pdf-bytes.js';
import { LabelPage, layoutLabel } from '../part-label/label-stock.js';
import { UserBadgePdf } from './UserBadgePdf.js';
import { renderUserBadgesPdf } from './user-badge-pdf-renderer.js';

const POINTS_PER_MILLIMETRE = 72 / 25.4;

// Real user ids are 32 characters, so each badge token is 38.
const BADGES = [
  { id: 'rFljpEBlRlbFzOCe6AzxjN3Ez365cQJ1', name: 'Thabo Mokoena' },
  { id: 'G4mw3WTWhCpH1VCQDwaqk8de509oAAQB', name: 'Ruan Botha' },
] satisfies UserBadgePdfModel[];

describe('stores badge PDF', () => {
  test('encodes a token the tablet resolves back to each person', () => {
    const payloads = collectLabelPages(UserBadgePdf({ badges: BADGES })).map(({ payload }) => payload);

    expect(payloads.map(parseScanToken)).toEqual(BADGES.map(({ id }) => ({ kind: 'badge', userId: id })));
  });

  test('prints each badge token at 0.625 mm modules, five dots of the 203 dpi head', () => {
    for (const { footer, payload } of collectLabelPages(UserBadgePdf({ badges: BADGES }))) {
      expect(layoutLabel(payload, footer.style).moduleWidth).toBeCloseTo(0.625 * POINTS_PER_MILLIMETRE, 3);
    }
  });

  test('renders one 40 by 30 millimetre label-stock page per person', async () => {
    const bytes = await renderUserBadgesPdf({ document: BADGES, filename: 'stores-badges.pdf' });
    const pageSizes = await getPdfPageSizes(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(pageSizes).toHaveLength(2);
    for (const page of pageSizes) {
      expect(page.width).toBeCloseTo(40 * POINTS_PER_MILLIMETRE, 3);
      expect(page.height).toBeCloseTo(30 * POINTS_PER_MILLIMETRE, 3);
    }
  });

  test('keeps a long name on one physical card', async () => {
    const bytes = await renderUserBadgesPdf({
      document: [{ id: 'rFljpEBlRlbFzOCe6AzxjN3Ez365cQJ1', name: 'Long stores person name '.repeat(6) }],
      filename: 'stores-badge.pdf',
    });

    expect(await getPdfPageSizes(bytes)).toHaveLength(1);
  });
});

type LabelPageProps = ComponentProps<typeof LabelPage>;
type RenderedElement = ReactElement<{ children?: ReactNode }>;

function collectLabelPages(node: ReactNode): LabelPageProps[] {
  if (Array.isArray(node)) return node.flatMap(collectLabelPages);
  if (!isValidElement(node)) return [];
  const element = node as RenderedElement;
  if (element.type === LabelPage) return [element.props as unknown as LabelPageProps];
  if (typeof element.type === 'function') {
    return collectLabelPages((element.type as (props: typeof element.props) => ReactNode)(element.props));
  }
  return collectLabelPages(element.props.children);
}
