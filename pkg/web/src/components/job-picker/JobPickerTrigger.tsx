import { getJobDisplayName, getJobOfferingKind } from '@pkg/domain';
import type { JobPickerOption } from '@pkg/schema';
import { IconX } from '@tabler/icons-react';

import { OfferingThumbnail } from '@/components/thumbnail/OfferingThumbnail.js';
import { Button } from '@/components/ui/button.js';
import { ComboboxTrigger } from '@/components/ui/combobox.js';
import { cn } from '@/lib/utils.js';

/**
 * How a chosen Job reads with the popup shut, and the one place it can be dropped again. The clear
 * sits beside the trigger rather than inside the popup's search field, where a control that drops
 * the selection would read as one that clears the search.
 */
export function JobPickerTrigger({
  className,
  clearLabel = 'Clear Job',
  disabled = false,
  id,
  onClear,
  placeholder,
  value,
}: {
  className?: string;
  clearLabel?: string;
  disabled?: boolean;
  id?: string;
  /** Omitted where the surface requires a Job, which has nothing to fall back to. */
  onClear?: () => void;
  placeholder: string;
  value: JobPickerOption | null;
}) {
  return (
    <div className={cn('flex min-w-0 items-center gap-1', className)}>
      <ComboboxTrigger
        aria-label={placeholder}
        disabled={disabled}
        id={id}
        render={
          // Transparent rather than the outline variant's `bg-background`, which is a shade darker
          // than `--card` in light mode: the trigger stands beside plain comboboxes, and those take
          // the surface they sit on. Dark mode already agreed — both land on `bg-input/30` there.
          <Button
            className="min-w-0 flex-1 justify-between bg-transparent font-normal"
            type="button"
            variant="outline"
          />
        }
      >
        {value ? (
          <span className="flex min-w-0 items-center gap-2">
            <OfferingThumbnail
              className="size-5"
              kind={getJobOfferingKind(value)}
              label={getJobDisplayName(value)}
              preview={false}
              size="sm"
              thumbnailDataUrl={value.productThumbnailDataUrl}
            />
            {/* The code never truncates — it is what names the Job. The display name gives way. */}
            <span className="shrink-0 font-mono text-xs">{value.code}</span>
            <span className="truncate text-muted-foreground text-xs">{getJobDisplayName(value)}</span>
          </span>
        ) : (
          <span className="truncate text-muted-foreground">{placeholder}</span>
        )}
      </ComboboxTrigger>
      {value && onClear ? (
        <Button
          aria-label={clearLabel}
          disabled={disabled}
          onClick={onClear}
          size="icon-sm"
          type="button"
          variant="ghost"
        >
          <IconX />
        </Button>
      ) : null}
    </div>
  );
}
