import type { MeterExtraction } from '@pkg/schema/contracting';
import { MeterExtraction as ExtractionSchema } from '@pkg/schema/contracting';
export type ReadMeterPhoto = (input: { bytes: Uint8Array; contentType: string }) => Promise<MeterExtraction>;
export type MeterMeasurement = { aiValue: number | null; aiConfidence: number };

/** What the AI reads off a meter photo, or null when it could not read one. */
export async function measureMeterPhoto(
  bytes: Uint8Array,
  contentType: string,
  readPhoto: ReadMeterPhoto,
): Promise<MeterMeasurement | null> {
  try {
    const result = ExtractionSchema.parse(await readPhoto({ bytes, contentType }));
    return { aiValue: result.value, aiConfidence: Math.round(result.confidence * 10000) / 10000 };
  } catch {
    return null;
  }
}
