import type { Db } from '@pkg/db';
import { partCategories } from '@pkg/db/equipment';

/** Every Part belongs to one Part Category, so a suite seeds one before its Parts. */
export async function seedPartCategory(db: Db, name = 'General'): Promise<string> {
  const [row] = await db.insert(partCategories).values({ name }).returning({ id: partCategories.id });
  if (!row) throw new Error('Part Category insert did not return a row');

  return row.id;
}
