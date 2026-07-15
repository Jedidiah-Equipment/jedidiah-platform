// Shared company contact facts. Consumed by the lander and any app surface that
// needs the canonical location, phone number, or social links.

export const JEDIDIAH_LOCATION = 'KZN, South Africa';

export const JEDIDIAH_FACEBOOK_URL = 'https://www.facebook.com/jedidiahequipment';

export const JEDIDIAH_INSTAGRAM_URL = 'https://www.instagram.com/jedidiahequipment/';

// South African contact number stored as its national significant number (an
// integer, no leading zero). Format with formatContactNumber for display, or
// contactNumberE164 for tel/WhatsApp links.
export const JEDIDIAH_CONTACT_NUMBER = 450500545;

const SA_COUNTRY_CODE = '27';

function nationalDigits(value: number): string {
  return String(value).padStart(9, '0');
}

export function formatContactNumber(value: number = JEDIDIAH_CONTACT_NUMBER): string {
  const digits = nationalDigits(value);
  return `(0${digits.slice(0, 2)}) ${digits.slice(2, 5)} ${digits.slice(5)}`;
}

export function contactNumberE164(value: number = JEDIDIAH_CONTACT_NUMBER): string {
  return `+${SA_COUNTRY_CODE}${nationalDigits(value)}`;
}
