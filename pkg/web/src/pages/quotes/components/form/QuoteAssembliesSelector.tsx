import { formatCurrency, resolveEffectiveBom } from '@pkg/domain';
import type { Assembly, QuoteSelectedAssembly } from '@pkg/schema';
import { XIcon } from 'lucide-react';
import type React from 'react';

import { Button } from '@/components/ui/button.js';
import { Checkbox } from '@/components/ui/checkbox.js';
import { cn } from '@/lib/utils.js';

import { type QuoteFormValues, resolveSelectedAssemblySnapshots, type SelectedAssemblySnapshot } from '../types.js';

type QuoteAssembliesSelectorProps = {
  catalogAssemblies: Assembly[];
  currencyCode: string;
  initialSelections: QuoteSelectedAssembly[];
  onChange: (value: QuoteFormValues['selectedAssemblies']) => void;
  readOnly: boolean;
  value: QuoteFormValues['selectedAssemblies'];
};

export const QuoteAssembliesSelector: React.FC<QuoteAssembliesSelectorProps> = ({
  catalogAssemblies,
  currencyCode,
  initialSelections,
  onChange,
  readOnly,
  value,
}) => {
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
  const staleSnapshots = new Set(staleSelections);
  const selectedSnapshotByCatalogId = new Map<string, SelectedAssemblySnapshot>();
  for (const snapshot of selectedSnapshots) {
    if (snapshot.productAssemblyId && !staleSnapshots.has(snapshot)) {
      selectedSnapshotByCatalogId.set(snapshot.productAssemblyId, snapshot);
    }
  }

  const setCatalogSelected = (assemblyId: string, selected: boolean) => {
    if (selected) {
      onChange([...value, { type: 'catalog', productAssemblyId: assemblyId }]);
      return;
    }

    onChange(
      value.filter((selection) => {
        if (selection.type === 'catalog') {
          return selection.productAssemblyId !== assemblyId;
        }

        const initialSelection = initialSelections.find((item) => item.id === selection.id);
        return initialSelection?.productAssemblyId !== assemblyId;
      }),
    );
  };

  return (
    <div className="grid gap-4">
      <div className="grid items-start gap-4 lg:grid-cols-2">
        <div className="grid auto-rows-min gap-2">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-normal">Standard</h4>
          {standardAssemblies.length === 0 ? (
            <p className="text-muted-foreground text-sm">No standard assemblies.</p>
          ) : (
            <div className="grid gap-2">
              {standardAssemblies.map((assembly) => {
                const isOverridden = overriddenStandardAssemblyIds.has(assembly.id);

                return (
                  <div
                    className="flex h-12 items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 text-sm"
                    key={assembly.id}
                  >
                    <span className={`min-w-0 truncate ${isOverridden ? 'text-muted-foreground line-through' : ''}`}>
                      {assembly.name}
                    </span>
                    {isOverridden ? <span className="text-muted-foreground text-xs">Overridden</span> : null}
                  </div>
                );
              })}
            </div>
          )}
        </div>
        <div className="grid auto-rows-min gap-2">
          <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-normal">Optional</h4>
          {optionalAssemblies.length === 0 && staleSelections.length === 0 ? (
            <p className="text-muted-foreground text-sm">No optional assemblies.</p>
          ) : (
            <div className="grid gap-2">
              {optionalAssemblies.map((assembly) => {
                const snapshot = selectedSnapshotByCatalogId.get(assembly.id);
                const isSelected = Boolean(snapshot);
                // Selected options display their locked snapshot name/price so they don't shift
                // when the catalog assembly is later renamed or repriced.
                const displayName = snapshot?.quotedName ?? assembly.name;
                const displayPrice = snapshot?.quotedPrice ?? assembly.price;

                return (
                  <div
                    className={cn(
                      'flex h-12 items-center justify-between gap-3 rounded-md border px-3 text-sm',
                      isSelected ? 'border-primary/50 bg-primary/5' : 'bg-muted/10',
                    )}
                    key={assembly.id}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      <Checkbox
                        checked={isSelected}
                        disabled={readOnly}
                        onCheckedChange={(checked) => setCatalogSelected(assembly.id, checked === true)}
                      />
                      <span className="truncate">{displayName}</span>
                    </span>
                    <span className="shrink-0 text-muted-foreground">{formatCurrency(displayPrice, currencyCode)}</span>
                  </div>
                );
              })}
              {staleSelections.map((selection) => (
                <div
                  className="flex h-12 items-center justify-between gap-3 rounded-md border border-dashed px-3 text-sm"
                  key={selection.id}
                >
                  <span className="min-w-0">
                    <span className="block truncate">{selection.quotedName}</span>
                    <span className="block text-muted-foreground text-xs">Unavailable</span>
                  </span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="text-muted-foreground">{formatCurrency(selection.quotedPrice, currencyCode)}</span>
                    {readOnly ? null : (
                      <Button
                        aria-label={`Remove ${selection.quotedName}`}
                        size="icon-sm"
                        type="button"
                        variant="ghost"
                        onClick={() =>
                          onChange(value.filter((item) => item.type !== 'existing' || item.id !== selection.id))
                        }
                      >
                        <XIcon />
                      </Button>
                    )}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
