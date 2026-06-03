import { z } from 'zod';

// E.164 South African number: +27 followed by 9 digits (no leading 0).
// Only ZA is validated for now; broaden (e.g. via libphonenumber-js) here when needed.
const ZA_E164 = /^\+27[1-9]\d{8}$/;

export type PhoneNumber = z.infer<typeof PhoneNumber>;
export const PhoneNumber = z.string().trim().regex(ZA_E164, 'Enter a valid South African phone number');

// Nullable variant, mirrors NullableThumbnailDataUrl in thumbnail.ts.
export type NullablePhoneNumber = z.infer<typeof NullablePhoneNumber>;
export const NullablePhoneNumber = PhoneNumber.nullable();
