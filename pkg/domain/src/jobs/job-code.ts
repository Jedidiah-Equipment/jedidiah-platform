export function formatJobCode(code: number): string {
  return code.toString().padStart(4, '0');
}
