import { readingVerification } from '@pkg/domain/contracting';
import type { MeterExtraction } from '@pkg/schema/contracting';
import { MeterExtraction as ExtractionSchema } from '@pkg/schema/contracting';
export type ReadMeterPhoto = (input: { bytes: Uint8Array; contentType: string }) => Promise<MeterExtraction>;
export async function verifyPhoto(value: number, bytes: Uint8Array, contentType: string, readPhoto: ReadMeterPhoto) {
  try {
    const result = ExtractionSchema.parse(await readPhoto({ bytes, contentType }));
    const aiConfidence = Math.round(result.confidence * 10000) / 10000;
    return {
      aiValue: result.value,
      aiConfidence,
      aiVerification: readingVerification(value, result.value, aiConfidence),
    };
  } catch {
    return { aiValue: null, aiConfidence: null, aiVerification: 'pending' as const };
  }
}
