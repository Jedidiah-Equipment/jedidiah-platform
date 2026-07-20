/**
 * Production bay names sometimes embed the operator as "<bay> - <operator>". Next to an explicit
 * operator label that repetition is noise, so strip the exact suffix; any other name passes
 * through untouched.
 */
export function stripOperatorSuffix({
  bayName,
  operatorName,
}: {
  bayName: string;
  operatorName: string | null;
}): string {
  if (!operatorName) return bayName;

  const suffix = ` - ${operatorName}`;
  return bayName.endsWith(suffix) ? bayName.slice(0, -suffix.length) : bayName;
}
