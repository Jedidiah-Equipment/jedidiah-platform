import {
  CATEGORY_ICON_STROKE_WIDTH,
  CATEGORY_ICON_VIEW_BOX,
  categoryColourClassNames,
  categoryIcon,
} from '@pkg/domain/contracting';
import type { CategoryColour, CategoryIconKey } from '@pkg/schema/contracting';
import type React from 'react';
import { cn } from '@/lib/utils.js';

/**
 * A category's glyph on its tinted disc, the thumbnail every fleet surface shows. Decorative beside
 * the category name; pass `label` when it stands alone (a filter chip) so it is announced.
 */
export function CategoryIcon({
  icon,
  colour,
  size = 20,
  label,
  className,
}: {
  icon: CategoryIconKey;
  colour: CategoryColour;
  size?: 16 | 20 | 24;
  label?: string;
  className?: string;
}) {
  const glyph = categoryIcon(icon);
  const tone = categoryColourClassNames[colour];
  return (
    <span
      className={cn(
        'inline-flex shrink-0 items-center justify-center rounded-full border',
        tone.chip,
        tone.text,
        className,
      )}
      style={{ width: size + 10, height: size + 10 }}
      aria-hidden={label ? undefined : true}
    >
      <svg
        role="img"
        aria-label={label ?? glyph.label}
        width={size}
        height={size}
        viewBox={CATEGORY_ICON_VIEW_BOX}
        fill="none"
        stroke="currentColor"
        strokeWidth={CATEGORY_ICON_STROKE_WIDTH}
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <title>{label ?? glyph.label}</title>
        {glyph.paths.map((d) => (
          <path key={d} d={d} />
        ))}
      </svg>
    </span>
  );
}

/** The glyph beside its category name, the shape every list cell, option and title uses. */
export function CategoryLabel({
  icon,
  colour,
  name,
  size = 20,
  className,
}: {
  icon: CategoryIconKey;
  colour: CategoryColour;
  name: React.ReactNode;
  size?: 16 | 20 | 24;
  className?: string;
}) {
  return (
    <span className={cn('flex items-center', size === 24 ? 'gap-3' : 'gap-2', className)}>
      <CategoryIcon icon={icon} colour={colour} size={size} />
      {name}
    </span>
  );
}
