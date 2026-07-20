import { useQuery } from '@tanstack/react-query';

import { SelectField } from '@/components/form/fields/SelectField';
import { useTRPC } from '@/lib/trpc';

/** Salesperson select bound to the surrounding form field context. */
export function SalespersonSelectField({
  disabled = false,
  onValueCommit,
}: {
  disabled?: boolean;
  onValueCommit?: () => void;
}) {
  const trpc = useTRPC();
  const salespeople = useQuery(trpc.quotes.salespeople.queryOptions(undefined));

  return (
    <SelectField
      disabled={disabled || salespeople.isPending}
      emptyMessage={salespeople.isError ? 'Couldn’t load salespeople.' : 'No salespeople available.'}
      label="Salesperson"
      onValueCommit={onValueCommit}
      options={(salespeople.data?.users ?? []).map((user) => ({ label: user.name, value: user.id }))}
      placeholder={salespeople.isPending ? 'Loading salespeople…' : 'Select salesperson'}
    />
  );
}
