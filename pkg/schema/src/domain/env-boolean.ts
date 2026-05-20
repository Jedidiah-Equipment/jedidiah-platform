import { z } from 'zod';

export type EnvBoolean = z.infer<typeof EnvBoolean>;
export const EnvBoolean = z.enum(['true', 'false', '1', '0']).transform((value) => value === 'true' || value === '1');
