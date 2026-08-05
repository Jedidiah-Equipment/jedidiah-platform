import { badgeScanToken, parseScanToken } from '@pkg/domain';
import type { UserBadgePdfModel } from '@pkg/schema';
import { isValidElement, type ReactElement, type ReactNode } from 'react';
import { describe, expect, test } from 'vitest';

import { getPdfPageSizes } from '../bytes/pdf-bytes.js';
import { getCode128BarPattern } from '../part-label/code128.js';
import { USER_BADGE_PAGE_SIZE, UserBadgePdf } from './UserBadgePdf.js';
import { renderUserBadgesPdf } from './user-badge-pdf-renderer.js';

const BADGES = [
  { id: 'user-abc', name: 'Thabo Mokoena' },
  { id: 'user-def', name: 'Ruan Botha' },
] satisfies UserBadgePdfModel[];

describe('stores badge PDF', () => {
  test('encodes the prefixed token the tablet resolves back to the person', () => {
    // The pattern is the encoder's, but what matters is the payload it was handed.
    expect(getCode128BarPattern(badgeScanToken('user-abc'))).toBe(getCode128BarPattern('badge:user-abc'));
    expect(parseScanToken(badgeScanToken('user-abc'))).toEqual({ kind: 'badge', userId: 'user-abc' });
  });

  test('prints the person’s name, so a card can be picked off a bench by eye', () => {
    const text = collectText(
      UserBadgePdf({
        items: BADGES.map((badge, index) => ({
          badge,
          barcodeDataUri: index === 0 ? 'first' : 'second',
          barcodeWidth: 100,
        })),
      }),
    );

    expect(text).toEqual(expect.arrayContaining(['Thabo Mokoena', 'Ruan Botha']));
  });

  test('renders one label-stock page per person', async () => {
    const bytes = await renderUserBadgesPdf({ document: BADGES, filename: 'stores-badges.pdf' });
    const pageSizes = await getPdfPageSizes(bytes);

    expect(new TextDecoder().decode(bytes.slice(0, 5))).toBe('%PDF-');
    expect(pageSizes).toHaveLength(2);
    for (const page of pageSizes) {
      expect(page.width).toBeCloseTo(USER_BADGE_PAGE_SIZE.width, 3);
      expect(page.height).toBeCloseTo(USER_BADGE_PAGE_SIZE.height, 3);
    }
  });

  test('keeps a long name on one physical card', async () => {
    const bytes = await renderUserBadgesPdf({
      document: [{ id: 'user-long', name: 'Long stores person name '.repeat(6) }],
      filename: 'stores-badge.pdf',
    });

    expect(await getPdfPageSizes(bytes)).toHaveLength(1);
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
