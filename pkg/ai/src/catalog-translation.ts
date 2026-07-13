import type { CatalogTranslationKind } from '@pkg/domain';
import {
  TranslatableAssembly,
  TranslatableProductFields,
  TranslatableProductRangeFields,
  TranslatableProductRangeVariantFields,
} from '@pkg/schema';
import type { LanguageModel } from 'ai';
import { generateObject } from 'ai';
import { z } from 'zod';

const AFRIKAANS_TRANSLATION_SYSTEM_PROMPT = `Translate Canonical Text into Afrikaans (South Africa).
Use a professional South African agricultural-equipment marketing register; for example, translate trailer as "sleepwa".
Pass model codes, brand names, numbers, units, and dimensions through verbatim.
Return arrays in exactly the same length and order as the input. Echo every assembly id unchanged and translate only its name.`;

export const ProductTranslationOutput = TranslatableProductFields.extend({
  assemblies: z.array(TranslatableAssembly),
});
export type ProductTranslationOutput = z.infer<typeof ProductTranslationOutput>;

const ProductRangeTranslationOutput = TranslatableProductRangeFields;
export type ProductRangeTranslationOutput = z.infer<typeof ProductRangeTranslationOutput>;

const ProductRangeVariantTranslationOutput = TranslatableProductRangeVariantFields;
export type ProductRangeVariantTranslationOutput = z.infer<typeof ProductRangeVariantTranslationOutput>;

// Sources mirror outputs: canonical text goes in, the same-shaped Afrikaans text comes out.
export type ProductTranslationSource = ProductTranslationOutput;

type CatalogTranslationOutputByKind = {
  product: ProductTranslationOutput;
  range: ProductRangeTranslationOutput;
  variant: ProductRangeVariantTranslationOutput;
};

type CatalogTranslationSourceByKind = CatalogTranslationOutputByKind;

const TRANSLATORS: {
  [Kind in CatalogTranslationKind]: {
    schema: z.ZodType<CatalogTranslationOutputByKind[Kind]>;
    schemaName: string;
    validate: (source: CatalogTranslationSourceByKind[Kind], output: CatalogTranslationOutputByKind[Kind]) => string;
  };
} = {
  product: { schema: ProductTranslationOutput, schemaName: 'ProductTranslation', validate: validateProductOutput },
  range: { schema: ProductRangeTranslationOutput, schemaName: 'ProductRangeTranslation', validate: () => '' },
  variant: {
    schema: ProductRangeVariantTranslationOutput,
    schemaName: 'ProductRangeVariantTranslation',
    validate: () => '',
  },
};

export async function translateCatalogSourceToAfrikaans<Kind extends CatalogTranslationKind>({
  kind,
  model,
  source,
}: {
  kind: Kind;
  model: LanguageModel;
  source: CatalogTranslationSourceByKind[Kind];
}): Promise<CatalogTranslationOutputByKind[Kind]> {
  const translator = TRANSLATORS[kind];
  let validationError = '';

  for (let attempt = 0; attempt < 2; attempt += 1) {
    const { object } = await generateObject({
      maxRetries: 0,
      model,
      schema: translator.schema,
      schemaName: translator.schemaName,
      system: AFRIKAANS_TRANSLATION_SYSTEM_PROMPT,
      prompt: createPrompt(source, validationError),
    });

    validationError = translator.validate(source, object);
    if (!validationError) return object;
  }

  throw new Error(`${translator.schemaName} output changed input structure: ${validationError}`);
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
