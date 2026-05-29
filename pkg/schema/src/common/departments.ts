import { z } from 'zod';

export const DEPARTMENTS = ['procurement', 'supply', 'fabrication', 'paint', 'assembly'] as const;

export type Department = z.infer<typeof Department>;
export const Department = z.enum(DEPARTMENTS);
