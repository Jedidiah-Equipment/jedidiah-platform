import { IconChevronDown } from '@tabler/icons-react';
import type { ReactNode } from 'react';
import { useEffect, useRef, useState } from 'react';

import { useIsomorphicLayoutEffect } from '../lib/isomorphic-layout-effect.js';

// Smallest gap we leave between the panel and the viewport edge when the right-anchored panel is wider
// than the space to the left of its trigger.
const VIEWPORT_GUTTER = 12;

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
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [shift, setShift] = useState(0);

  // Measuring in a layout effect keeps the corrected offset inside the first painted frame, so a slow
  // device cannot paint the panel at its clipped position part-way through the fade-in.
  useIsomorphicLayoutEffect(() => {
    if (!open) {
      setShift(0);
      return;
    }

    const adjust = () => {
      const wrap = wrapRef.current;
      const panel = panelRef.current;
      if (!wrap || !panel) {
        return;
      }
      // offsetWidth ignores the open transition's scale, and the panel's right edge sits on the trigger's,
      // so this is the unshifted left edge regardless of what we applied last time.
      const naturalLeft = wrap.getBoundingClientRect().right - panel.offsetWidth;
      setShift(Math.max(0, VIEWPORT_GUTTER - naturalLeft));
    };

    adjust();
    window.addEventListener('resize', adjust);
    return () => window.removeEventListener('resize', adjust);
  }, [open]);

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
        ref={panelRef}
        role="menu"
        style={{ right: shift === 0 ? undefined : -shift }}
        className={`absolute top-[calc(100%+8px)] right-0 z-40 flex max-w-[calc(100vw-1.5rem)] origin-top-right -translate-y-1 scale-95 flex-col gap-1.5 opacity-0 transition duration-150 ease-out group-open:translate-y-0 group-open:scale-100 group-open:opacity-100 motion-reduce:transition-none ${panelClassName ?? ''}`}
      >
        {children}
      </div>
    </details>
  );
}
