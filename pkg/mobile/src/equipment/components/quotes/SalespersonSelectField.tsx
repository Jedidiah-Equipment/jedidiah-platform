import type { AuthId } from '@pkg/schema';
import { useQuery } from '@tanstack/react-query';

import { SelectField, type SelectFieldOption } from '@/components/form/fields/SelectField';
import { useTRPC } from '@/lib/trpc';

/** Salesperson select bound to the surrounding form field context. */
export function SalespersonSelectField({
  assigned = null,
  disabled = false,
  onValueCommit,
}: {
  /** The Quote's stored salesperson: still shown, disabled, once off the roster. */
  assigned?: { id: AuthId; name: string | null } | null;
  disabled?: boolean;
  onValueCommit?: () => void;
}) {
  const trpc = useTRPC();
  const salespeople = useQuery(trpc.quotes.salespeople.queryOptions(undefined));
  const options: SelectFieldOption[] = (salespeople.data?.users ?? []).map((user) => ({
    label: user.name,
    value: user.id,
  }));
  if (assigned?.name && !options.some((option) => option.value === assigned.id)) {
    options.push({ disabled: true, label: assigned.name, value: assigned.id });
  }

  return (
    <SelectField
      disabled={disabled || salespeople.isPending}
      emptyMessage={salespeople.isError ? 'Couldn’t load salespeople.' : 'No salespeople available.'}
      label="Salesperson"
      onValueCommit={onValueCommit}
      options={options}
      placeholder={salespeople.isPending ? 'Loading salespeople…' : 'Select salesperson'}
    />
  );
}
