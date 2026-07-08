import { z } from 'zod';

export function blankStringAsUndefined(value: unknown) {
  return typeof value === 'string' && value.trim() === '' ? undefined : value;
}

export type EnvBoolean = z.infer<typeof EnvBoolean>;
export const EnvBoolean = z.enum(['true', 'false', '1', '0']).transform((value) => value === 'true' || value === '1');

export const OptionalEnvString = z.preprocess(blankStringAsUndefined, z.string().min(1).optional());
export const OptionalEnvBoolean = z.preprocess(blankStringAsUndefined, EnvBoolean.optional());
export const defaultedEnvUrl = (defaultValue: string) =>
  z.preprocess(blankStringAsUndefined, z.string().url().default(defaultValue));
