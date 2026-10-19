import { z } from 'zod';
import { BUSINESSES } from '../common/business.js';

/** The record a push names: a Breakdown, a Machine or a Job. */
export const pushDataKinds = ['breakdown', 'machine', 'job'] as const;
export type PushDataKind = (typeof pushDataKinds)[number];

/**
 * The data a push carries, as the phone parses it: the business and record it names, and the in-app path tapping
 * it opens. The path lives inside the push's own business (`/<business>/…`), so the phone follows nothing else.
 */
export const PushData = z
  .object({
    business: z.enum(BUSINESSES),
    kind: z.enum(pushDataKinds),
    id: z.string().min(1),
    path: z.string(),
  })
  .refine(
    ({ business, path }) => {
      const root = `/${business}/`;
      return path.startsWith(root) && path.length > root.length && !path.includes('//');
    },
    { message: 'A push path lives inside its business.', path: ['path'] },
  );
export type PushData = z.infer<typeof PushData>;
