import { IconChevronDown } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useEffect, useRef } from 'react';

export function DropdownMenu({
  open,
  onOpenChange,
  label,
  ariaLabel,
  triggerClassName,
  panelClassName,
  children,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  label: ReactNode;
  ariaLabel?: string;
  triggerClassName: string;
  panelClassName?: string;
  children: ReactNode;
}) {
  const wrapRef = useRef<HTMLDetailsElement | null>(null);

  useEffect(() => {
    if (!open) {
      return;
    }
    const onPointerDown = (event: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(event.target as Node)) {
        onOpenChange(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onOpenChange(false);
      }
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open, onOpenChange]);

  return (
    <details
      ref={wrapRef}
      open={open}
      onToggle={(event) => {
        if (event.currentTarget.open !== open) {
          onOpenChange(event.currentTarget.open);
        }
      }}
      className="group relative flex-none"
    >
      <summary
        aria-label={ariaLabel}
        aria-haspopup="menu"
        className={`${triggerClassName} cursor-pointer list-none [&::-webkit-details-marker]:hidden`}
      >
        {label}
        <IconChevronDown
          size={16}
          stroke={2.4}
          aria-hidden="true"
          className="transition-transform duration-150 group-open:rotate-180"
        />
      </summary>
      <div
        role="menu"
        className={`absolute top-[calc(100%+8px)] right-0 z-40 flex origin-top-right -translate-y-1 scale-95 flex-col gap-1.5 opacity-0 transition duration-150 ease-out group-open:translate-y-0 group-open:scale-100 group-open:opacity-100 motion-reduce:transition-none ${panelClassName ?? ''}`}
      >
        {children}
      </div>
    </details>
  );
}
