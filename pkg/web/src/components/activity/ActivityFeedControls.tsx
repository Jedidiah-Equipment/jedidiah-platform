import { IconSearch } from '@tabler/icons-react';

import { Input } from '@/components/ui/input.js';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs.js';

/** The search box an Activity page puts in its header. */
export function ActivitySearch({
  onChange,
  placeholder,
  value,
}: {
  onChange: (search: string) => void;
  placeholder: string;
  value: string;
}) {
  return (
    <div className="relative w-64">
      <IconSearch className="-translate-y-1/2 pointer-events-none absolute top-1/2 left-2.5 size-4 text-muted-foreground" />
      <Input
        aria-label="Search Activity"
        className="pl-8"
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        value={value}
      />
    </div>
  );
}

/** The filter tabs over an Activity feed, one per label in the order given. */
export function ActivityFilterTabs<TFilter extends string>({
  labels,
  onChange,
  value,
}: {
  labels: Record<TFilter, string>;
  onChange: (filter: TFilter) => void;
  value: TFilter;
}) {
  return (
    <Tabs onValueChange={(filter) => onChange(filter as TFilter)} size="sm" value={value}>
      <TabsList aria-label="Filter Activity" variant="default">
        {(Object.keys(labels) as TFilter[]).map((filter) => (
          <TabsTrigger key={filter} value={filter}>
            {labels[filter]}
          </TabsTrigger>
        ))}
      </TabsList>
    </Tabs>
  );
}
