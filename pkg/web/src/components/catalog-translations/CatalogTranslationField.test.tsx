import type React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it, vi } from 'vitest';

import { Button } from '@/components/ui/button.js';
import {
  CatalogTranslationCanonicalStringList,
  CatalogTranslationManualToggle,
  CatalogTranslationRevertDialog,
  CatalogTranslationStringListInputs,
} from './CatalogTranslationField.js';

describe('CatalogTranslationField', () => {
  it('routes manual toggle changes to enable or confirm-revert actions', () => {
    const onEnable = vi.fn();
    const onRequestRevert = vi.fn();
    const toggle = CatalogTranslationManualToggle({
      fieldLabel: 'Description',
      isManual: false,
      onEnable,
      onRequestRevert,
    });

    toggle.props.onCheckedChange(true);
    toggle.props.onCheckedChange(false);

    expect(onEnable).toHaveBeenCalledOnce();
    expect(onRequestRevert).toHaveBeenCalledOnce();
  });

  it('requires an explicit confirmation before reverting a field to AI', () => {
    const onConfirm = vi.fn();
    const dialog = CatalogTranslationRevertDialog({
      fieldLabel: 'Description',
      isOpen: true,
      isPending: false,
      onConfirm,
      onOpenChange: vi.fn(),
    });

    const confirmButton = findElement(
      dialog,
      (element) => element.type === Button && element.props.variant === 'destructive',
    );
    if (!confirmButton) throw new Error('Confirmation button missing');
    const onClick = confirmButton.props.onClick as (() => void) | undefined;
    if (!onClick) throw new Error('Confirmation action missing');
    onClick();

    expect(onConfirm).toHaveBeenCalledOnce();
    expect(collectText(dialog)).toContain('discard your Afrikaans and regenerate from English');
  });

  it('renders one Afrikaans input per English list item without structural controls', () => {
    const html = renderToStaticMarkup(
      <>
        <CatalogTranslationCanonicalStringList value={['High capacity', 'New English feature']} />
        <CatalogTranslationStringListInputs
          canonical={['High capacity', 'New English feature']}
          fieldLabel="Key features"
          isManual
          onValueChange={vi.fn()}
          value={['Hoe kapasiteit']}
        />
      </>,
    );

    expect(html).toContain('High capacity');
    expect(html).toContain('New English feature');
    expect(html).toContain('value="Hoe kapasiteit"');
    expect(html).toContain('value=""');
    expect(html).not.toMatch(/add|remove/i);
  });
});

function collectText(node: React.ReactNode): string {
  if (typeof node === 'string') return node;
  if (Array.isArray(node)) return node.map(collectText).join(' ');
  if (!node || typeof node !== 'object' || !('props' in node)) return '';
  return collectText((node.props as { children?: React.ReactNode }).children);
}

function findElement(
  node: React.ReactNode,
  predicate: (element: React.ReactElement<Record<string, unknown>>) => boolean,
): React.ReactElement<Record<string, unknown>> | undefined {
  if (Array.isArray(node)) {
    for (const child of node) {
      const match = findElement(child, predicate);
      if (match) return match;
    }
    return undefined;
  }
  if (!node || typeof node !== 'object' || !('props' in node)) return undefined;
  const element = node as React.ReactElement<Record<string, unknown>>;
  if (predicate(element)) return element;
  return findElement(element.props.children as React.ReactNode, predicate);
}
