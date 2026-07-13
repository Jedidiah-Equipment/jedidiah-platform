import { IconChevronDown } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

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
  const wrapRef = useRef<HTMLDivElement | null>(null);
  // Keep the panel mounted while its close transition runs, then remove it from the tab order and DOM.
  const [mounted, setMounted] = useState(open);
  const [shown, setShown] = useState(open);

  useEffect(() => {
    if (open) {
      setMounted(true);
      return;
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), 220);
    return () => clearTimeout(timer);
  }, [open]);

  useEffect(() => {
    if (!mounted || !open) {
      return;
    }
    const frame = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(frame);
  }, [mounted, open]);

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
    <div ref={wrapRef} className="relative flex-none">
      <button
        type="button"
        onClick={() => onOpenChange(!open)}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="menu"
        className={triggerClassName}
      >
        {label}
        <IconChevronDown
          size={16}
          stroke={2.4}
          aria-hidden="true"
          className={`transition-transform duration-150 ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {mounted ? (
        <div
          role="menu"
          onTransitionEnd={() => {
            if (!open) {
              setMounted(false);
            }
          }}
          className={`absolute top-[calc(100%+8px)] right-0 z-40 flex origin-top-right flex-col gap-1.5 transition duration-150 ease-out motion-reduce:transition-none ${
            shown ? 'scale-100 opacity-100' : 'pointer-events-none -translate-y-1 scale-95 opacity-0'
          } ${panelClassName ?? ''}`}
        >
          {children}
        </div>
      ) : null}
    </div>
  );
}
