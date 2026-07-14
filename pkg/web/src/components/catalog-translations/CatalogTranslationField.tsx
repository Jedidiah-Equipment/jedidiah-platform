// biome-ignore-all lint/suspicious/noArrayIndexKey: Translation rows mirror read-only canonical arrays and never reorder locally.
import type { CatalogTranslationFieldState } from '@pkg/schema';
import type React from 'react';

import { Badge } from '@/components/ui/badge.js';
import { Button } from '@/components/ui/button.js';
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog.js';
import { Input } from '@/components/ui/input.js';
import { Label } from '@/components/ui/label.js';
import { Switch } from '@/components/ui/switch.js';
import { Textarea } from '@/components/ui/textarea.js';

type CatalogTranslationManualToggleProps = {
  disabled?: boolean;
  fieldLabel: string;
  isManual: boolean;
  onEnable: () => void;
  onRequestRevert: () => void;
};

export function CatalogTranslationManualToggle({
  disabled,
  fieldLabel,
  isManual,
  onEnable,
  onRequestRevert,
}: CatalogTranslationManualToggleProps) {
  return (
    <Switch
      aria-label={`${fieldLabel} manual override`}
      checked={isManual}
      disabled={disabled}
      onCheckedChange={(checked) => (checked ? onEnable() : onRequestRevert())}
    />
  );
}

type CatalogTranslationRevertDialogProps = {
  fieldLabel: string;
  isOpen: boolean;
  isPending: boolean;
  onConfirm: () => void;
  onOpenChange: (open: boolean) => void;
};

export function CatalogTranslationRevertDialog({
  fieldLabel,
  isOpen,
  isPending,
  onConfirm,
  onOpenChange,
}: CatalogTranslationRevertDialogProps) {
  return (
    <Dialog onOpenChange={onOpenChange} open={isOpen}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Return {fieldLabel} to AI translation?</DialogTitle>
          <DialogDescription>
            This will discard your Afrikaans and regenerate from English. The current manual value cannot be restored.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose render={<Button disabled={isPending} type="button" variant="outline" />}>Cancel</DialogClose>
          <Button disabled={isPending} onClick={onConfirm} type="button" variant="destructive">
            Regenerate with AI
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

type CatalogTranslationFieldFrameProps = {
  canonical: React.ReactNode;
  children: React.ReactNode;
  fieldLabel: string;
  isManual: boolean;
  isPending?: boolean;
  onEnable: () => void;
  onInteract?: () => void;
  onRequestRevert: () => void;
  state: CatalogTranslationFieldState;
};

export function CatalogTranslationFieldFrame({
  canonical,
  children,
  fieldLabel,
  isManual,
  isPending,
  onEnable,
  onInteract,
  onRequestRevert,
  state,
}: CatalogTranslationFieldFrameProps) {
  return (
    <section className="rounded-lg border p-4" onFocusCapture={onInteract}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h3 className="font-medium">{fieldLabel}</h3>
          <CatalogTranslationStateBadge state={state} />
        </div>
        <Label className="flex items-center gap-2">
          <span className="text-muted-foreground text-sm">Manual</span>
          <CatalogTranslationManualToggle
            disabled={isPending ?? false}
            fieldLabel={fieldLabel}
            isManual={isManual}
            onEnable={onEnable}
            onRequestRevert={onRequestRevert}
          />
        </Label>
      </div>
      <div className="grid gap-3 md:grid-cols-2">
        <div className="min-w-0">
          <p className="mb-1 text-muted-foreground text-xs font-medium uppercase tracking-wide">English</p>
          {canonical}
        </div>
        <div className="min-w-0">
          <p className="mb-1 text-muted-foreground text-xs font-medium uppercase tracking-wide">Afrikaans</p>
          {children}
        </div>
      </div>
    </section>
  );
}

export function CatalogTranslationCanonicalText({
  multiline = false,
  value,
}: {
  multiline?: boolean;
  value: string | null;
}) {
  return multiline ? (
    <Textarea aria-label="English canonical text" disabled rows={4} value={value ?? ''} />
  ) : (
    <Input aria-label="English canonical text" disabled value={value ?? ''} />
  );
}

export function CatalogTranslationStateBadge({ state }: { state: CatalogTranslationFieldState }) {
  const labels = {
    fresh: 'Fresh',
    missing: 'Missing',
    needsReview: 'Needs review',
    stale: 'Stale',
  } satisfies Record<CatalogTranslationFieldState, string>;

  const colorClassNames = {
    fresh: 'border-emerald-500/50 bg-emerald-500/15 text-emerald-800 dark:text-emerald-200',
    missing: 'border-slate-500/50 bg-slate-500/15 text-slate-800 dark:text-slate-200',
    needsReview: 'border-blue-500/50 bg-blue-500/15 text-blue-800 dark:text-blue-200',
    stale: 'border-orange-500/50 bg-orange-500/15 text-orange-800 dark:text-orange-200',
  } satisfies Record<CatalogTranslationFieldState, string>;

  return (
    <Badge className={colorClassNames[state]} variant="outline">
      {labels[state]}
    </Badge>
  );
}

type CatalogTranslationStringListInputsProps = {
  canonical: string[];
  fieldLabel: string;
  isManual: boolean;
  onValueChange: (value: string[]) => void;
  value: string[];
};

export function CatalogTranslationCanonicalStringList({ value }: { value: string[] }) {
  return (
    <div className="space-y-2">
      {value.map((item, index) => (
        <Input aria-label={`English canonical item ${index + 1}`} disabled key={`${index}-${item}`} value={item} />
      ))}
    </div>
  );
}

export function CatalogTranslationStringListInputs({
  canonical,
  fieldLabel,
  isManual,
  onValueChange,
  value,
}: CatalogTranslationStringListInputsProps) {
  return (
    <div className="space-y-2">
      {canonical.map((item, index) => (
        <Input
          aria-label={`${fieldLabel} Afrikaans item ${index + 1}`}
          disabled={!isManual}
          key={`${index}-${item}`}
          onChange={(event) => {
            const next = canonical.map((_, itemIndex) => value[itemIndex] ?? '');
            next[index] = event.target.value;
            onValueChange(next);
          }}
          value={value[index] ?? ''}
        />
      ))}
    </div>
  );
}

type CatalogTranslationTechnicalDetailsInputsProps = {
  canonical: Array<{ label: string; value: string }>;
  isManual: boolean;
  onValueChange: (value: Array<{ label: string; value: string }>) => void;
  value: Array<{ label: string; value: string }>;
};

export function CatalogTranslationCanonicalTechnicalDetails({
  value,
}: {
  value: Array<{ label: string; value: string }>;
}) {
  return (
    <div className="space-y-2">
      {value.map((detail, index) => (
        <div className="grid grid-cols-2 gap-2" key={index}>
          <Input aria-label={`English canonical technical detail label ${index + 1}`} disabled value={detail.label} />
          <Input aria-label={`English canonical technical detail value ${index + 1}`} disabled value={detail.value} />
        </div>
      ))}
    </div>
  );
}

export function CatalogTranslationTechnicalDetailsInputs({
  canonical,
  isManual,
  onValueChange,
  value,
}: CatalogTranslationTechnicalDetailsInputsProps) {
  return (
    <div className="space-y-2">
      {canonical.map((_, index) => (
        <div className="grid grid-cols-2 gap-2" key={index}>
          {(['label', 'value'] as const).map((part) => (
            <Input
              aria-label={`Technical details Afrikaans ${part} ${index + 1}`}
              disabled={!isManual}
              key={part}
              onChange={(event) => {
                const next = canonical.map((__, itemIndex) => ({
                  label: value[itemIndex]?.label ?? '',
                  value: value[itemIndex]?.value ?? '',
                }));
                const nextDetail = next[index];
                if (!nextDetail) return;
                nextDetail[part] = event.target.value;
                onValueChange(next);
              }}
              value={value[index]?.[part] ?? ''}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
