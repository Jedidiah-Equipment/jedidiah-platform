import { eq, partBom } from '@pkg/db';
import { describe, expect } from 'vitest';

import { actorUserId, test } from '../test/build-fixtures.js';
import { PartNotBuiltError } from './part-bom-errors.js';
import { savePartBom } from './part-bom-service.js';

describe('savePartBom', () => {
  test('refuses a BOM on a Part that is bought rather than built', async ({ context }) => {
    await expect(
      savePartBom({
        actorUserId,
        db: context.db,
        input: { lines: [{ componentPartId: context.parts.cylinder.id, quantity: 1 }], partId: context.parts.bolt.id },
      }),
    ).rejects.toBeInstanceOf(PartNotBuiltError);
  });

  test('rewrites the whole BOM, and an empty one is the trivial build', async ({ context }) => {
    const emptied = await savePartBom({
      actorUserId,
      db: context.db,
      input: { lines: [], partId: context.parts.assembly.id },
    });
    expect(emptied.lines).toEqual([]);

    const rewritten = await savePartBom({
      actorUserId,
      db: context.db,
      input: { lines: [{ componentPartId: context.parts.bolt.id, quantity: 7 }], partId: context.parts.assembly.id },
    });
    expect(rewritten.lines).toEqual([expect.objectContaining({ componentPartId: context.parts.bolt.id, quantity: 7 })]);

    const stored = await context.db.select().from(partBom).where(eq(partBom.parentPartId, context.parts.assembly.id));
    expect(stored).toHaveLength(1);
  });
});
