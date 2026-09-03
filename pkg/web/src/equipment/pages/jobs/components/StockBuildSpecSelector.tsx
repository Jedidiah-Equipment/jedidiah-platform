import { resolveEffectiveBom } from '@pkg/domain';
import type { Assembly } from '@pkg/schema';
import type React from 'react';

import { Checkbox } from '@/components/ui/checkbox.js';
import { cn } from '@/lib/utils.js';

type StockBuildSpecSelectorProps = {
  catalogAssemblies: Assembly[];
  disabled: boolean;
  onChange: (assemblyIds: string[]) => void;
  value: readonly string[];
};

/**
 * A Stock Build's Build Spec: which Optional Assemblies the showroom machine is built with. It shows
 * no prices — a Stock Build carries no commercial facts — and it strikes through the Standard
 * Assemblies a pick overrides, so the specifier sees the machine the CFO will actually describe.
 */
export const StockBuildSpecSelector: React.FC<StockBuildSpecSelectorProps> = ({
  catalogAssemblies,
  disabled,
  onChange,
  value,
}) => {
  const standardAssemblies = catalogAssemblies.filter((assembly) => assembly.kind === 'standard');
  const optionalAssemblies = catalogAssemblies.filter((assembly) => assembly.kind === 'optional');
  const selected = new Set(value);
  const { overriddenStandardAssemblyIds } = resolveEffectiveBom({
    catalogAssemblies,
    selectedAssemblies: optionalAssemblies
      .filter((assembly) => selected.has(assembly.id))
      .map((assembly) => ({ assemblyName: assembly.name, productAssemblyId: assembly.id })),
  });

  const toggle = (assemblyId: string, isSelected: boolean) => {
    onChange(isSelected ? [...value, assemblyId] : value.filter((id) => id !== assemblyId));
  };

  return (
    <div className="grid items-start gap-4 lg:grid-cols-2">
      <div className="grid min-w-0 grid-cols-1 auto-rows-min gap-2">
        <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-normal">Standard</h4>
        {standardAssemblies.length === 0 ? (
          <p className="text-muted-foreground text-sm">No standard assemblies.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {standardAssemblies.map((assembly) => {
              const isOverridden = overriddenStandardAssemblyIds.has(assembly.id);

              return (
                <div
                  className="flex h-12 items-center justify-between gap-3 rounded-md border bg-muted/20 px-3 text-sm"
                  key={assembly.id}
                >
                  <span className={cn('min-w-0 truncate', isOverridden && 'text-muted-foreground line-through')}>
                    {assembly.name}
                  </span>
                  {isOverridden ? <span className="text-muted-foreground text-xs">Overridden</span> : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
      <div className="grid min-w-0 grid-cols-1 auto-rows-min gap-2">
        <h4 className="font-medium text-muted-foreground text-xs uppercase tracking-normal">Optional</h4>
        {optionalAssemblies.length === 0 ? (
          <p className="text-muted-foreground text-sm">No optional assemblies.</p>
        ) : (
          <div className="grid grid-cols-1 gap-2">
            {optionalAssemblies.map((assembly) => {
              const isSelected = selected.has(assembly.id);

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
                      className="shrink-0"
                      disabled={disabled}
                      onCheckedChange={(checked) => toggle(assembly.id, checked === true)}
                    />
                    <span className="min-w-0 truncate">{assembly.name}</span>
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
};
