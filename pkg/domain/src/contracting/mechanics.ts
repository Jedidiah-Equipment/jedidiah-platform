type MechanicOption = { value: string; label: string };

/** A Mechanic picker's options, plus the record's own Mechanic once they have left the Mechanic set, so it still reads. */
export function withRecordMechanic(
  options: readonly MechanicOption[],
  record?: { primaryMechanicUserId: string | null; mechanicName: string | null },
): MechanicOption[] {
  const current = record?.primaryMechanicUserId;
  return current && !options.some((option) => option.value === current)
    ? [...options, { value: current, label: record?.mechanicName ?? 'Unavailable mechanic' }]
    : [...options];
}
