import type React from 'react';
import { cn } from '@/lib/utils.js';
import { textChange } from './text-change.js';

/** The tidied text the person was shown, with what they removed struck and what they added marked. */
export function TextChange({ shown, saved }: { shown: string; saved: string }) {
  let offset = 0;
  return (
    <p className="whitespace-pre-wrap">
      {textChange(shown, saved).map((segment) => {
        const key = `${segment.kind}-${offset}`;
        offset += segment.text.length;
        return (
          <span
            key={key}
            className={cn(
              segment.kind !== 'same' && 'rounded-sm px-0.5',
              segment.kind === 'removed' && 'bg-red-500/15 text-red-700 line-through dark:text-red-300',
              segment.kind === 'added' && 'bg-green-500/15 text-green-700 dark:text-green-300',
            )}
          >
            {segment.text}
          </span>
        );
      })}
    </p>
  );
}

export function LabelledText({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <span className="text-xs text-muted-foreground">{label}</span>
      <div className="whitespace-pre-wrap text-sm">{children}</div>
    </div>
  );
}
