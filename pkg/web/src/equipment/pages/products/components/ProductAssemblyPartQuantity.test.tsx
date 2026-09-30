import type { Part } from '@pkg/schema/equipment';
import type { ReactNode } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, describe, expect, it, vi } from 'vitest';

const selection = vi.hoisted(() => ({ partId: 'cable' }));

vi.mock('@/components/form/index.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/components/form/index.js')>()),
  useTypedAppFormContext: () => ({
    Subscribe: ({
      children,
      selector,
    }: {
      children: (partId: string) => ReactNode;
      selector: (state: { values: { assemblies: { parts: { partId: string }[] }[] } }) => string;
    }) => children(selector({ values: { assemblies: [{ parts: [{ partId: selection.partId }] }] } })),
  }),
}));

import { PartQuantityField } from './ProductAssembliesEditor.js';

const partOptions = [
  { id: 'cable', standardPurchaseLengthMm: 1000, unitOfMeasure: 'mm' },
  { id: 'bar', standardPurchaseLengthMm: 6000, unitOfMeasure: 'mm' },
  { id: 'bearing', standardPurchaseLengthMm: null, unitOfMeasure: 'piece' },
] as Part[];

afterEach(() => {
  selection.partId = 'cable';
});

describe('Assembly Part quantity', () => {
  it('names six cable pieces by their standard length instead of presenting the count as millimetres', () => {
    const html = renderQuantity();

    expect(html).toContain('Pieces · 1000 mm each');
    expect(html).toContain('value="6"');
    expect(html).not.toContain('title="Millimetres"');
  });

  it('takes the piece length from the selected Part when the selection changes', () => {
    renderQuantity();
    selection.partId = 'bar';

    const html = renderQuantity();

    expect(html).toContain('Pieces · 6000 mm each');
    expect(html).not.toContain('1000 mm');
    expect(html).toContain('value="6"');
  });

  it('keeps the compact counting unit for a non-linear Part', () => {
    selection.partId = 'bearing';

    expect(renderQuantity()).toContain('title="Pieces">pc</span>');
  });
});

function renderQuantity() {
  return renderToStaticMarkup(
    <PartQuantityField
      errors={[]}
      field={{ handleBlur: vi.fn(), handleChange: vi.fn(), state: { meta: { errors: [] }, value: 6 } }}
      isInvalid={false}
      parentIndex={0}
      partIndex={0}
      partOptions={partOptions}
    />,
  );
}
