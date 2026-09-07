import { getBusinessRole } from '../auth/authorization.js';

export function canCaptureBaseline(access: Parameters<typeof getBusinessRole>[0]): boolean {
  const role = getBusinessRole(access, 'contracting');
  return role === 'super-admin' || role === 'contracting-admin';
}

export function meterDisagreementHint({
  value,
  aiValue,
  aiVerification,
}: {
  value: number;
  aiValue: number | null;
  aiVerification: string;
}): string | null {
  if (aiVerification !== 'disagrees' || !aiValue || !value) return null;
  const ratio = aiValue / value;
  return (ratio >= 9 && ratio <= 11) || (ratio >= 0.09 && ratio <= 0.11)
    ? 'Possible tenths-drum misread (≈10× / 0.1×).'
    : null;
}
