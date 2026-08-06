import { MockLanguageModelV3 } from 'ai/test';
import { describe, expect, test } from 'vitest';

import { extractSupplierInvoice } from './supplier-invoice-extraction.js';

const PDF_BYTES = new Uint8Array([0x25, 0x50, 0x44, 0x46]);

function generatedJson(value: unknown) {
  return {
    content: [{ type: 'text' as const, text: JSON.stringify(value) }],
    finishReason: { unified: 'stop' as const, raw: 'stop' },
    usage: {
      inputTokens: { total: 10, noCache: 10, cacheRead: 0, cacheWrite: 0 },
      outputTokens: { total: 10, text: 10, reasoning: 0 },
    },
    warnings: [],
  };
}

function extract(model: MockLanguageModelV3) {
  return extractSupplierInvoice({ bytes: PDF_BYTES, contentType: 'application/pdf', model });
}

describe('supplier invoice extraction', () => {
  test('reads the invoice header, its lines, and the Job codes the Supplier echoed', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () =>
        generatedJson({
          invoiceDate: '2026-08-04',
          invoiceNumber: 'INV-88213',
          jobCodes: ['JOB-0421'],
          lines: [
            {
              description: 'HEX BOLT GALV M12 X 40MM',
              jobCodes: [],
              lineTotal: 1375,
              partCode: 'BOLT-M12-40',
              quantity: 100,
              unitPrice: 13.75,
            },
          ],
        }),
    });

    await expect(extract(model)).resolves.toEqual({
      invoiceDate: '2026-08-04',
      invoiceNumber: 'INV-88213',
      jobCodes: ['JOB-0421'],
      lines: [
        {
          description: 'HEX BOLT GALV M12 X 40MM',
          jobCodes: [],
          lineTotal: 1375,
          partCode: 'BOLT-M12-40',
          quantity: 100,
          unitPrice: 13.75,
        },
      ],
    });
  });

  test('sends the PDF itself as a file part alongside the transcribe-only instruction', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => generatedJson({ invoiceDate: null, invoiceNumber: null, jobCodes: [], lines: [] }),
    });

    await extract(model);

    const call = model.doGenerateCalls[0];
    expect(JSON.stringify(call?.prompt)).toContain('Never infer, calculate, or fill in a value that is not there');
    expect(call?.prompt).toContainEqual(
      expect.objectContaining({
        content: expect.arrayContaining([
          expect.objectContaining({ data: PDF_BYTES, mediaType: 'application/pdf', type: 'file' }),
        ]),
        role: 'user',
      }),
    );
  });

  test('keeps a line whose numbers the invoice never printed, rather than guessing them', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () =>
        generatedJson({
          invoiceDate: null,
          invoiceNumber: 'INV-1',
          jobCodes: [],
          lines: [
            { description: 'Delivery', jobCodes: [], lineTotal: null, partCode: null, quantity: null, unitPrice: null },
          ],
        }),
    });

    await expect(extract(model)).resolves.toMatchObject({
      lines: [{ description: 'Delivery', quantity: null, unitPrice: null }],
    });
  });

  test('rejects output that does not fit the contract, so the caller can report an unreadable invoice', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => generatedJson({ lines: 'not a list' }),
    });

    await expect(extract(model)).rejects.toThrow();
  });

  test('does not retry a provider that has already refused the document', async () => {
    const model = new MockLanguageModelV3({
      doGenerate: async () => {
        throw new Error('provider refused');
      },
    });

    await expect(extract(model)).rejects.toThrow('provider refused');
    expect(model.doGenerateCalls).toHaveLength(1);
  });
});
