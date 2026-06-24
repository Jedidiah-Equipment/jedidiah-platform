import { IconFileText, IconWorld } from '@tabler/icons-react';
import type React from 'react';

import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip.js';

export const FIELD_USAGE_SURFACES = ['lander', 'brochure'] as const;

export type FieldUsageSurface = (typeof FIELD_USAGE_SURFACES)[number];
export type FieldUsage = readonly FieldUsageSurface[];

export const LANDER_USAGE = ['lander'] as const satisfies FieldUsage;
export const BROCHURE_USAGE = ['brochure'] as const satisfies FieldUsage;
export const LANDER_AND_BROCHURE_USAGE = ['lander', 'brochure'] as const satisfies FieldUsage;

export const PRODUCT_FIELD_USAGE = {
  assemblies: LANDER_AND_BROCHURE_USAGE,
  category: LANDER_AND_BROCHURE_USAGE,
  description: LANDER_AND_BROCHURE_USAGE,
  keyFeatures: LANDER_AND_BROCHURE_USAGE,
  modelCode: LANDER_AND_BROCHURE_USAGE,
  name: LANDER_AND_BROCHURE_USAGE,
  rangeId: LANDER_AND_BROCHURE_USAGE,
} as const;

export const PRODUCT_IMAGE_SLOT_USAGE = {
  banner: BROCHURE_USAGE,
  primary: LANDER_AND_BROCHURE_USAGE,
  secondary1: LANDER_USAGE,
  secondary2: LANDER_USAGE,
  technicalDrawing: BROCHURE_USAGE,
} as const;

export const PRODUCT_RANGE_FIELD_USAGE = {
  description: LANDER_USAGE,
  image: LANDER_USAGE,
  logo: BROCHURE_USAGE,
  name: LANDER_USAGE,
} as const;

type FieldUsageLabelProps = {
  children: React.ReactNode;
  usage?: FieldUsage;
};

export function FieldUsageLabel({ children, usage = [] }: FieldUsageLabelProps) {
  if (usage.length === 0) {
    return <>{children}</>;
  }

  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <span className="truncate">{children}</span>
      <span className="inline-flex items-center gap-1 text-muted-foreground">
        {usage.map((surface) => (
          <FieldUsageIcon key={surface} surface={surface} />
        ))}
      </span>
    </span>
  );
}

function FieldUsageIcon({ surface }: { surface: FieldUsageSurface }) {
  const label = surface === 'lander' ? 'Used on Lander' : 'Used in brochure';
  const Icon = surface === 'lander' ? IconWorld : IconFileText;

  return (
    <Tooltip>
      <TooltipTrigger
        render={
          <span
            aria-label={label}
            className="inline-flex size-4 items-center justify-center rounded-sm text-muted-foreground"
            role="img"
          />
        }
      >
        <Icon aria-hidden className="size-3.5" />
      </TooltipTrigger>
      <TooltipContent>{label}</TooltipContent>
    </Tooltip>
  );
}
