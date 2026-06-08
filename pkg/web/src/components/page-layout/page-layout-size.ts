import { cn } from '@/lib/utils.js';

export type PageLayoutSize = 'md' | 'lg' | 'full';

const pageLayoutSizeClassNames = {
  md: 'max-w-5xl',
  lg: 'max-w-7xl',
  full: '',
} satisfies Record<PageLayoutSize, string>;

export function getPageLayoutSizeClassName(size: PageLayoutSize): string {
  return cn('mx-auto w-full', pageLayoutSizeClassNames[size]);
}
