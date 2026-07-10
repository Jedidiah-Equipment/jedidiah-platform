import { z } from 'zod';

const PublicCodeNumber = z.int().positive().refine(Number.isSafeInteger);

export function formatJobCode(code: number): string {
  return `JOB-${code.toString().padStart(5, '0')}`;
}

export function formatQuoteCode(code: number): string {
  return `QUO-${code.toString().padStart(5, '0')}`;
}

export function parseQuoteCodeNumber(input: string): number | undefined {
  const normalized = input.trim().replace(/^QUO-/i, '');

  if (!/^\d+$/.test(normalized)) {
    return undefined;
  }

  const code = Number.parseInt(normalized, 10);

  return Number.isSafeInteger(code) && code > 0 ? code : undefined;
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
  .union([PublicCodeNumber, QuoteCodeString])
  .transform((code) => (typeof code === 'number' ? formatQuoteCode(code) : code))
  .pipe(QuoteCodeString);

const QuoteCodeInputString = z
  .string()
  .transform((input, ctx) => {
    const code = parseQuoteCodeNumber(input);

    if (code === undefined) {
      ctx.addIssue({ code: 'custom', message: 'Enter a Quote Code such as QUO-00008 or 8' });
      return z.NEVER;
    }

    return formatQuoteCode(code);
  })
  .pipe(QuoteCodeString);

export type QuoteCodeInput = z.infer<typeof QuoteCodeInput>;
export const QuoteCodeInput = z
  .union([PublicCodeNumber, QuoteCodeInputString])
  .transform((code) => (typeof code === 'number' ? formatQuoteCode(code) : code))
  .pipe(QuoteCodeString)
  .describe('Exact Quote Code, such as QUO-00008 or 8.');
