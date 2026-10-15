import type React from 'react';
import { useEffect, useRef, useState } from 'react';

import { Button } from '@/components/ui/button.js';
import { cn } from '@/lib/utils.js';

/**
 * Whether the clamped text is actually hiding anything, measured rather than guessed from the
 * text: how many lines a note wraps to depends on the column it lands in, so a character count
 * offers a toggle that reveals nothing on a wide screen and withholds one on a narrow screen.
 * Only meaningful while clamped — an expanded paragraph always reports that it fits.
 */
function useIsTextClipped(enabled: boolean): [React.RefObject<HTMLParagraphElement | null>, boolean] {
  const ref = useRef<HTMLParagraphElement>(null);
  const [clipped, setClipped] = useState(false);

  useEffect(() => {
    const element = ref.current;

    if (!element || !enabled) {
      return;
    }

    const measure = () => setClipped(element.scrollHeight > element.clientHeight);

    measure();

    // Re-measure when the column changes under a still window (a sheet opening beside the
    // feed) and when the window itself changes: the clamp holds the paragraph's height fixed, so
    // its box can report no change while the text inside it reflows across the clamp boundary.
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    window.addEventListener('resize', measure);

    return () => {
      observer.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, [enabled]);

  return [ref, clipped];
}

/**
 * What was said, drawn as the speech bubble it is: a tail pointing back at the speaker, who said it, the text clamped
 * to four lines with a toggle when it runs longer, and an optional footer naming where it was said.
 */
export const ActivityNoteBubble: React.FC<{ author: string; footer?: React.ReactNode; text: string }> = ({
  author,
  footer,
  text,
}) => {
  const [expanded, setExpanded] = useState(false);
  const [textRef, clipped] = useIsTextClipped(!expanded);
  // Keep the toggle once expanded: the unclamped paragraph reads as fitting, and dropping it there
  // would strand the reader with no way back.
  const expandable = expanded || clipped;

  return (
    <div className="relative w-fit max-w-full">
      {/*
        A rotated square rather than a border-drawn triangle: it carries the bubble's own border on
        the two edges that face out and its own background over the edge it sits on, so the tail
        keeps the bubble's outline instead of being a differently-coloured wedge beside it.
      */}
      <span
        aria-hidden
        className="absolute top-4 -left-1 size-2.5 rotate-45 border-b border-l border-border/70 bg-card transition-colors group-hover:border-foreground/25"
      />
      <div className="overflow-hidden rounded-xl border border-border/70 bg-card transition-colors group-hover:border-foreground/25">
        <p className="px-3.5 pt-2.5 -mb-2 font-medium text-muted-foreground text-xs">{author}</p>
        <p
          className={cn('px-3.5 py-2.5 text-sm leading-6 whitespace-pre-wrap', !expanded && 'line-clamp-4')}
          ref={textRef}
        >
          {text}
        </p>
        {expandable ? (
          <Button
            className="relative z-10 mx-3.5 mb-1 px-0"
            onClick={() => setExpanded((open) => !open)}
            size="sm"
            variant="link"
          >
            {expanded ? 'Show less' : 'Show more'}
          </Button>
        ) : null}
        {footer}
      </div>
    </div>
  );
};
