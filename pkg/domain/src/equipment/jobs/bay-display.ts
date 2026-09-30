/** The identity of a physical Bay together with its assigned Operator. */
export function getBayDisplayText({ bayName, operatorName }: { bayName: string; operatorName: string | null }): {
  primaryText: string;
  secondaryText: string;
} {
  const operator = operatorName?.trim();
  const suffix = ` - ${operator}`;
  const withoutSuffix = operator && bayName.endsWith(suffix) ? bayName.slice(0, -suffix.length) : bayName;
  const displayBayName = withoutSuffix.trim() ? withoutSuffix : bayName;
  return operator
    ? { primaryText: operator, secondaryText: displayBayName }
    : { primaryText: bayName, secondaryText: 'No operator' };
}
