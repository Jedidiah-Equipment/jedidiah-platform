import type { MeterExtraction } from '@pkg/schema/contracting';
import { MeterExtraction as ExtractionSchema } from '@pkg/schema/contracting';
export type ReadMeterPhoto = (input: { bytes: Uint8Array; contentType: string }) => Promise<MeterExtraction>;
export const READING_PHOTO_POLICY = {
  allowedContentTypes: ['image/jpeg', 'image/png'],
  maxBytes: 10 * 1024 * 1024,
} as const;
// Below 80% remains a management exception even when the digits happen to agree.
export const METER_CONFIDENCE_THRESHOLD = 0.8;
export function readingVerification(value: number, aiValue: number | null, aiConfidence: number | null) {
  if (aiConfidence === null) return 'pending' as const;
  if (aiValue === null || aiConfidence < METER_CONFIDENCE_THRESHOLD) return 'low-confidence' as const;
  return Math.round(value * 10) === Math.round(aiValue * 10) ? ('agrees' as const) : ('disagrees' as const);
}
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
