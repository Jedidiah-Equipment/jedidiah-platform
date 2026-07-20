import { formatCurrency, resolveEffectiveBom } from '@pkg/domain';
import type { Assembly, QuoteSelectedAssembly } from '@pkg/schema';
import { IconCheck, IconX } from '@tabler/icons-react-native';
import type React from 'react';
import { Pressable, View } from 'react-native';

import { Icon } from '@/components/ui/icon';
import { Text } from '@/components/ui/text';
import {
  type QuoteEditFormValues,
  resolveSelectedAssemblySnapshots,
  type SelectedAssemblySnapshot,
} from '@/lib/quote-presentation';

export function QuoteAssembliesEditor({
  catalogAssemblies,
  currencyCode,
  initialSelections,
  onChange,
  readOnly,
  value,
}: {
  catalogAssemblies: Assembly[];
  currencyCode: string;
  initialSelections: QuoteSelectedAssembly[];
  onChange: (value: QuoteEditFormValues['selectedAssemblies']) => void;
  readOnly: boolean;
  value: QuoteEditFormValues['selectedAssemblies'];
}) {
  const standardAssemblies = catalogAssemblies.filter((assembly) => assembly.kind === 'standard');
  const optionalAssemblies = catalogAssemblies.filter((assembly) => assembly.kind === 'optional');
  const selectedSnapshots = resolveSelectedAssemblySnapshots({
    catalogAssemblies,
    formSelections: value,
    initialSelections,
  });
  const { overriddenStandardAssemblyIds, staleSelections } = resolveEffectiveBom({
    catalogAssemblies,
    selectedAssemblies: selectedSnapshots,
  });
  const staleSnapshotSet = new Set(staleSelections);
  const selectedSnapshotByCatalogId = new Map<string, SelectedAssemblySnapshot>();
  for (const snapshot of selectedSnapshots) {
    if (snapshot.productAssemblyId && !staleSnapshotSet.has(snapshot)) {
      selectedSnapshotByCatalogId.set(snapshot.productAssemblyId, snapshot);
    }
  }

  const setSelected = (assemblyId: string, selected: boolean) => {
    if (selected) {
      onChange([...value, { type: 'catalog', productAssemblyId: assemblyId }]);
      return;
    }

    onChange(
      value.filter((selection) => {
        if (selection.type === 'catalog') return selection.productAssemblyId !== assemblyId;
        return initialSelections.find((item) => item.id === selection.id)?.productAssemblyId !== assemblyId;
      }),
    );
  };

  return (
    <View className="gap-5">
      <AssemblyGroup label="Optional" primary>
        {optionalAssemblies.length === 0 && staleSelections.length === 0 ? (
          <EmptyText>No optional assemblies.</EmptyText>
        ) : (
          <View className="gap-2">
            {optionalAssemblies.map((assembly) => {
              const snapshot = selectedSnapshotByCatalogId.get(assembly.id);
              const selected = Boolean(snapshot);
              return (
                <Pressable
                  accessibilityRole="checkbox"
                  accessibilityState={{ checked: selected, disabled: readOnly }}
                  className={`min-h-12 flex-row items-center gap-3 rounded-xl border px-3 py-2.5 ${
                    selected ? 'border-primary/50 bg-primary/5' : 'border-border bg-muted/10'
                  } ${readOnly ? 'opacity-60' : 'active:bg-muted'}`}
                  disabled={readOnly}
                  key={assembly.id}
                  onPress={() => setSelected(assembly.id, !selected)}
                >
                  <View
                    className={`h-5 w-5 items-center justify-center rounded-md border ${
                      selected ? 'border-primary bg-primary' : 'border-border bg-surface'
                    }`}
                  >
                    {selected ? <Icon className="text-primary-foreground" icon={IconCheck} size={13} /> : null}
                  </View>
                  <Text className="min-w-0 flex-1 text-sm text-foreground" numberOfLines={2}>
                    {snapshot?.quotedName ?? assembly.name}
                  </Text>
                  <Text className="text-xs text-muted-foreground" mono>
                    {formatCurrency(snapshot?.quotedPrice ?? assembly.price, currencyCode)}
                  </Text>
                </Pressable>
              );
            })}

            {staleSelections.map((selection) => (
              <View
                className="min-h-12 flex-row items-center gap-3 rounded-xl border border-dashed border-border px-3 py-2.5"
                key={selection.id}
              >
                <View className="min-w-0 flex-1">
                  <Text className="text-sm text-foreground" numberOfLines={1}>
                    {selection.quotedName}
                  </Text>
                  <Text className="text-xs text-muted-foreground">Unavailable</Text>
                </View>
                <Text className="text-xs text-muted-foreground" mono>
                  {formatCurrency(selection.quotedPrice, currencyCode)}
                </Text>
                {!readOnly ? (
                  <Pressable
                    accessibilityLabel={`Remove ${selection.quotedName}`}
                    accessibilityRole="button"
                    className="h-9 w-9 items-center justify-center rounded-lg active:bg-muted"
                    onPress={() =>
                      onChange(value.filter((item) => item.type !== 'existing' || item.id !== selection.id))
                    }
                  >
                    <Icon className="text-muted-foreground" icon={IconX} size={16} />
                  </Pressable>
                ) : null}
              </View>
            ))}
          </View>
        )}
      </AssemblyGroup>

      <AssemblyGroup label="Standard">
        {standardAssemblies.length === 0 ? (
          <EmptyText>No standard assemblies.</EmptyText>
        ) : (
          standardAssemblies.map((assembly) => {
            const overridden = overriddenStandardAssemblyIds.has(assembly.id);
            return (
              <View
                className="h-12 flex-row items-center justify-between gap-3 rounded-xl border border-border bg-muted/20 px-3"
                key={assembly.id}
              >
                <Text
                  className={`min-w-0 flex-1 text-sm ${overridden ? 'text-muted-foreground line-through' : 'text-foreground'}`}
                  numberOfLines={1}
                >
                  {assembly.name}
                </Text>
                {overridden ? <Text className="text-xs text-muted-foreground">Overridden</Text> : null}
              </View>
            );
          })
        )}
      </AssemblyGroup>
    </View>
  );
}

function AssemblyGroup({
  children,
  label,
  primary = false,
}: {
  children: React.ReactNode;
  label: string;
  primary?: boolean;
}) {
  return (
    <View className="gap-2">
      <Text
        className={`text-[10px] uppercase tracking-widest ${primary ? 'text-primary' : 'text-muted-foreground'}`}
        mono
      >
        {label}
      </Text>
      {children}
    </View>
  );
}

function EmptyText({ children }: { children: React.ReactNode }) {
  return <Text className="text-sm text-muted-foreground">{children}</Text>;
}
