import { z } from 'zod';

import { UUID } from '../../common/uuid.js';
import { PartCode, PartName, PartStockTrackingMode, PartUnitOfMeasure } from './part.js';

/**
 * How much of a component one unit of the parent consumes. Components may be measured Parts, so this
 * carries decimals; the per-class integer rule is enforced against the component's own unit class.
 */
export type PartBomQuantity = z.infer<typeof PartBomQuantity>;
export const PartBomQuantity = z
  .number()
  .finite()
  .multipleOf(0.001, 'BOM quantity supports at most three decimal places')
  .positive();

export type PartBomLineInput = z.infer<typeof PartBomLineInput>;
export const PartBomLineInput = z.object({ componentPartId: UUID, quantity: PartBomQuantity }).strict();

export type SavePartBomInput = z.infer<typeof SavePartBomInput>;
export const SavePartBomInput = z
  .object({
    /**
     * The whole BOM, rewritten wholesale. An empty list is legitimate: a fabricated Part whose
     * components are all raw material has a trivial build, and raw material posts nothing.
     */
    lines: z.array(PartBomLineInput),
    partId: UUID,
  })
  .strict()
  .superRefine((input, context) => {
    // The table's primary key is (parent, component), so a repeated component is a unique violation
    // rather than a second line. Caught here it reads as a field error, not an internal failure.
    const seen = new Set<string>();

    for (const [index, line] of input.lines.entries()) {
      if (seen.has(line.componentPartId)) {
        context.addIssue({
          code: 'custom',
          message: 'This component is already on the Bill of Materials',
          path: ['lines', index, 'componentPartId'],
        });
      }
      seen.add(line.componentPartId);
    }
  });

export type PartBomLine = z.infer<typeof PartBomLine>;
export const PartBomLine = z.object({
  componentCode: PartCode,
  componentIsInternallyFabricated: z.boolean(),
  componentName: PartName,
  componentPartId: UUID,
  componentStockTrackingMode: PartStockTrackingMode,
  componentUnitOfMeasure: PartUnitOfMeasure,
  quantity: PartBomQuantity,
});

export type PartBomResult = z.infer<typeof PartBomResult>;
export const PartBomResult = z.object({ lines: z.array(PartBomLine), partId: UUID });

export type PartBomInput = z.infer<typeof PartBomInput>;
export const PartBomInput = z.object({ partId: UUID }).strict();
