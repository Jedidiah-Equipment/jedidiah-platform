import type { ReactNode } from 'react';
import { View } from 'react-native';

import { Text } from '@/components/ui/text';

/** A titled detail card, matching the Bay slot and Job detail panes. */
export function FactCard({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View className="rounded-2xl border border-border bg-surface p-4">
      <Text className="mb-3 text-[11px] uppercase tracking-widest text-muted-foreground" weight="semibold">
        {title}
      </Text>
      {children}
    </View>
  );
}

/** A two-column row of fact cells; RN has no CSS grid, so equal-width flex cells stand in. */
export function FactRow({ children }: { children: ReactNode }) {
  return <View className="flex-row gap-4">{children}</View>;
}

/** A labelled value cell. */
export function FactField({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <View className="min-w-0 flex-1">
      <Text className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">{label}</Text>
      <Text className="text-sm text-surface-foreground" mono={mono} weight="semibold">
        {value}
      </Text>
    </View>
  );
}

export type JobFacts = {
  jobCode: string;
  quoteCode: string;
  workName: string;
  productSerialNumber: string | null;
  customerCompanyName: string | null;
};

/**
 * The JOB facts card (job code, quote code, work name, serial, customer) shared by the Bay Slot detail
 * pane (#520) and Job Detail (#615), so the two surfaces show the Job's reference details identically.
 */
export function JobFactsCard(facts: JobFacts) {
  return (
    <FactCard title="Job">
      <View className="gap-4">
        <FactRow>
          <FactField label="JOB CODE" mono value={facts.jobCode} />
          <FactField label="QUOTE CODE" mono value={facts.quoteCode} />
        </FactRow>
        <FactRow>
          <FactField label="WORK" value={facts.workName} />
          {facts.productSerialNumber ? (
            <FactField label="PRODUCT SERIAL" mono value={facts.productSerialNumber} />
          ) : null}
        </FactRow>
        <FactField label="CUSTOMER" value={facts.customerCompanyName ?? '—'} />
      </View>
    </FactCard>
  );
}
