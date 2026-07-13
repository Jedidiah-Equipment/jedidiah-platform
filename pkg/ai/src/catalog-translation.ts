import type { LanguageModel } from 'ai';
import { generateObject } from 'ai';
import { z } from 'zod';

const AFRIKAANS_TRANSLATION_SYSTEM_PROMPT = `Translate Canonical Text into Afrikaans (South Africa).
Use a professional South African agricultural-equipment marketing register; for example, translate trailer as "sleepwa".
Pass model codes, brand names, numbers, units, and dimensions through verbatim.
Return arrays in exactly the same length and order as the input. Echo every assembly id unchanged and translate only its name.`;

export type ProductTranslationSource = {
  assemblies: Array<{ id: string; name: string }>;
  category: string | null;
  description: string | null;
  keyFeatures: string[];
  name: string;
  nameHighlight: string | null;
  technicalDetails: Array<{ label: string; value: string }>;
};

export const ProductTranslationOutput = z.object({
  assemblies: z.array(z.object({ id: z.string().uuid(), name: z.string() })),
  category: z.string().nullable(),
  description: z.string().nullable(),
  keyFeatures: z.array(z.string()),
  name: z.string(),
  nameHighlight: z.string().nullable(),
  technicalDetails: z.array(z.object({ label: z.string(), value: z.string() })),
});
export type ProductTranslationOutput = z.infer<typeof ProductTranslationOutput>;

const ProductRangeTranslationOutput = z.object({
  description: z.string().nullable(),
  name: z.string(),
});
export type ProductRangeTranslationOutput = z.infer<typeof ProductRangeTranslationOutput>;

const ProductRangeVariantTranslationOutput = z.object({ name: z.string() });
export type ProductRangeVariantTranslationOutput = z.infer<typeof ProductRangeVariantTranslationOutput>;

export async function translateProductBundleToAfrikaans({
  model,
  source,
}: {
  model: LanguageModel;
  source: ProductTranslationSource;
}): Promise<ProductTranslationOutput> {
  let validationError = '';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { object } = await generateObject({
      maxRetries: 0,
      model,
      schema: ProductTranslationOutput,
      schemaName: 'ProductTranslation',
      system: AFRIKAANS_TRANSLATION_SYSTEM_PROMPT,
      prompt: createPrompt(source, validationError),
    });

    validationError = validateProductOutput(source, object);
    if (!validationError) return object;
  }

  throw new Error(`Product translation output changed input structure: ${validationError}`);
}

export async function translateProductRangeToAfrikaans({
  model,
  source,
}: {
  model: LanguageModel;
  source: { description: string | null; name: string };
}): Promise<ProductRangeTranslationOutput> {
  const { object } = await generateObject({
    maxRetries: 0,
    model,
    schema: ProductRangeTranslationOutput,
    schemaName: 'ProductRangeTranslation',
    system: AFRIKAANS_TRANSLATION_SYSTEM_PROMPT,
    prompt: createPrompt(source),
  });
  return object;
}

export async function translateProductRangeVariantToAfrikaans({
  model,
  source,
}: {
  model: LanguageModel;
  source: { name: string };
}): Promise<ProductRangeVariantTranslationOutput> {
  const { object } = await generateObject({
    maxRetries: 0,
    model,
    schema: ProductRangeVariantTranslationOutput,
    schemaName: 'ProductRangeVariantTranslation',
    system: AFRIKAANS_TRANSLATION_SYSTEM_PROMPT,
    prompt: createPrompt(source),
  });
  return object;
}

function createPrompt(source: unknown, validationError = ''): string {
  const correction = validationError
    ? `\nThe previous response was rejected: ${validationError}. Preserve the input structure exactly.`
    : '';
  return `Translate this JSON Canonical Text. Return only the requested structured output.${correction}\n${JSON.stringify(source)}`;
}

function validateProductOutput(source: ProductTranslationSource, output: ProductTranslationOutput): string {
  if (output.keyFeatures.length !== source.keyFeatures.length) return 'keyFeatures length changed';
  if (output.technicalDetails.length !== source.technicalDetails.length) return 'technicalDetails length changed';
  if (output.assemblies.length !== source.assemblies.length) return 'assemblies length changed';

  const mismatchedAssemblyIndex = output.assemblies.findIndex(
    (assembly, index) => assembly.id !== source.assemblies[index]?.id,
  );
  return mismatchedAssemblyIndex === -1 ? '' : `assembly id changed at index ${mismatchedAssemblyIndex}`;
}
