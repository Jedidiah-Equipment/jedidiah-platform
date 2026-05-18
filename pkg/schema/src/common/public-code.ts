import { z } from 'zod';

export function formatJobCode(code: number): string {
  return `JOB-${code.toString().padStart(5, '0')}`;
}

export function formatQuoteCode(code: number): string {
  return `QUO-${code.toString().padStart(5, '0')}`;
}

const JobCodeString = z
  .string()
  .regex(/^JOB-\d{5,}$/)
  .brand<'JobCode'>();

export type JobCode = z.infer<typeof JobCode>;
export const JobCode = z
  .union([z.int().positive().refine(Number.isSafeInteger), JobCodeString])
  .transform((code) => (typeof code === 'number' ? formatJobCode(code) : code))
  .pipe(JobCodeString);

const QuoteCodeString = z
  .string()
  .regex(/^QUO-\d{5,}$/)
  .brand<'QuoteCode'>();

export type QuoteCode = z.infer<typeof QuoteCode>;
export const QuoteCode = z
  .union([z.int().positive().refine(Number.isSafeInteger), QuoteCodeString])
  .transform((code) => (typeof code === 'number' ? formatQuoteCode(code) : code))
  .pipe(QuoteCodeString);
